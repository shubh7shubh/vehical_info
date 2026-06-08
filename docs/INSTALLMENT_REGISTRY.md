# Ledger Schema + Sub-ID Entry + Installment Registry + Reminder Counts

## Context

The client's mental model is the physical loan book (one ledger row per customer + a
monthly payment grid — see the WhatsApp ledger photo). Three gaps to close:

1. **Sub-ID has no UI.** The backend already lets a `sub_id` create customers
   (`create_customer` accepts `sub_id`, RLS allows the insert, `enforce_sub_id_range`
   gates it) but the sub-ID dashboard is just a static "Bulk Customer Entry" panel with
   no form. Sub-IDs must be able to add customers (deduped), like admin/employee.
2. **Schema doesn't carry the ledger fields.** Need account number, post office,
   district, model number, purchase date on the customer; and month no / penalty /
   receipt no / signature on each payment; plus a follow-up log (array of {note, time}).
3. **No installment registry or triage.** The Customers page should become the place
   where an employee searches a customer and records the installment they came to pay,
   logs follow-ups, and the header shows 4 colored counts so staff know who to chase.

All of this must respect the **existing multi-branch tree** (owner → branches → each
branch's admin/employee/sub_id, RLS-scoped). See "Branch scoping" below — it is not
optional.

## Decisions (confirmed with user)

- **Extend** the existing normalized schema additively (keep customer card + smart
  search + vehicles/guarantors working; RC/engine stay optional).
- **Reminder buckets (pure months-behind):** `0 → green`, `1–2 → yellow`,
  `3 → orange`, `>3 → red`.
- **Dedup key = account number, unique *per branch*.** Sub-ID range stays a count cap
  (no change to `enforce_sub_id_range`).
- **Tests: Vitest** (pure TS logic) **+ pgTAP** (RPCs/triggers).

## Branch scoping & owner visibility (do not miss)

The tree is already built (Phase 2.7). Every new artifact must keep it intact:

- **New `followups` table** follows the Phase 3+ checklist from CLAUDE.md verbatim:
  `branch_id uuid not null references branches(id)`, a `followups_set_branch_id`
  before-insert trigger, a `followups_branch_idx` index, branch-scoped RLS
  (`is_employee_or_admin() and branch_id = current_branch_id()`) **plus** a
  `followups_owner_read` select-only policy. Attach the `audit_log_trigger` to it.
- **account_no uniqueness is per-branch** — partial unique index on
  `(branch_id, account_no)`. Two branches can each have their own ledger #3473; that is
  correct, each branch keeps its own physical book.
- **Writes reject the owner.** `log_payment` and `create_customer` already require
  `caller.branch_id is not null` and role in (admin/employee[/sub_id]) → owner
  (branch_id NULL) cannot write. Owner stays read-only at the DB layer.
- **Header colored counts are per-branch.** `customer_status_counts()` is
  `security invoker`, so it returns only the caller's branch via existing RLS. The pills
  render only in the admin/employee header — the owner uses its own `ownerNav`, so it
  never sees the operational header.
- **Owner sees status per branch** by extending the existing `owner_branch_stats()`
  (`security definer`, gated by `is_owner()`) to add the 4 bucket counts per branch, so
  the owner dashboard cards + branch drill-down show each branch's green/yellow/orange/
  red. No cross-branch leakage to branch staff.

## Schema — migration `supabase/migrations/20260609120000_ledger_fields.sql`

New migration (never edit pushed files). Additive only:

```sql
-- customers: ledger header fields
alter table public.customers
  add column account_no       text,
  add column address_post     text,   -- पु. post office
  add column address_district text,   -- जि. district
  add column model_no         text,   -- मॉडेल्स नं
  add column purchase_date    date;   -- दिनांक (drives installment schedule)

-- per-branch dedup on the physical-book account number
create unique index customers_account_no_branch_uq
  on public.customers (branch_id, account_no)
  where account_no is not null and deleted_at is null;

-- payments: ledger grid columns
alter table public.payments
  add column month_no      int,                              -- महिने (installment #)
  add column penalty_paise bigint not null default 0 check (penalty_paise >= 0),
  add column receipt_no    text,                             -- पावती क्र
  add column signature     boolean not null default false;   -- सही
-- total = amount_paise + penalty_paise (computed in queries/UI, not stored)

-- follow-up log (the "array of {text, time}")
create table public.followups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  note text not null,
  created_by uuid references public.users(id),
  branch_id uuid not null references public.branches(id),
  created_at timestamptz not null default now()
);
create index followups_branch_idx   on public.followups(branch_id);
create index followups_customer_idx on public.followups(customer_id);

create trigger followups_set_branch_id before insert on public.followups
  for each row execute function public.set_branch_id();      -- add 'followups' case
create trigger followups_audit after insert or update or delete on public.followups
  for each row execute function public.audit_log_trigger();

alter table public.followups enable row level security;
create policy followups_rw on public.followups for select
  using (public.is_employee_or_admin() and branch_id = public.current_branch_id());
create policy followups_insert on public.followups for insert
  with check (public.is_employee_or_admin() and branch_id = public.current_branch_id());
create policy followups_owner_read on public.followups for select
  using (public.is_owner());
```

Add a `'followups'` arm to `set_branch_id()` (derive from `customers.branch_id` via
`customer_id`) by `create or replace` in this migration — mirrors the existing child-row
arms. Verify the `payment_mode` enum values in `..._schema.sql` (expected `cash`/
`online`); the registry defaults to `cash`.

## RPCs — migration `supabase/migrations/20260609120100_ledger_rpcs.sql`

All `create or replace`, business logic in Postgres per CLAUDE.md.

1. **`create_customer(p jsonb)`** — extend the existing one:
   - read new fields `customer.account_no | address_post | address_district | model_no`
     and `loan.purchase_date`.
   - **dedup:** if `account_no` present and a non-deleted customer in
     `caller.branch_id` already has it → `raise 'A customer with account number %
     already exists', account_no`. Keep RC/engine checks (only fire when provided).
   - insert the new customer columns; set `loans.started_at := purchase_date` and
     `due_day := extract(day from purchase_date)` so the minimal ledger form needs no
     separate due-day. Bank selector stays (Bank Recovery/Phase 5 needs `bank_id`);
     pre-select the first bank.
2. **`log_payment(p jsonb)`** — installment registry write. Validates caller is
   admin/employee, not disabled, has a branch; resolves the customer's active loan;
   inserts a payment row (`amount_paise`=installment, `penalty_paise`, `month_no`,
   `receipt_no`, `signature`, `mode`, `paid_at`, `recorded_by`). `security definer`,
   branch stamped by `set_branch_id`. Input:
   `{customer_id, month_no, installment_paise, penalty_paise, receipt_no, signature, mode, paid_at}`.
3. **`customer_status_counts()`** — `security invoker` (branch RLS applies). Per active
   loan: `expected = least(whole_months_since(purchase_date), tenure_months)`,
   `behind = greatest(expected - paid_count, 0)`; returns
   `count filter (behind=0) green, (behind in 1..2) yellow, (behind=3) orange,
   (behind>3) red`. The SQL month formula mirrors the TS helper exactly (see Tests).
4. **`owner_branch_stats()`** — `create or replace` to add the 4 bucket counts per
   branch (security definer, `is_owner()` gate) for the owner dashboard + drill-down.
5. Follow-ups: a plain insert under RLS from the server action is sufficient (single
   row, `set_branch_id` + with-check enforce branch) — no RPC needed. Reads
   (registry detail: customer header, loan, payments, followups) use plain
   branch-scoped selects, same pattern as the existing customer card.

## UI changes

- **Sub-ID dashboard** (`app/dashboard/page.tsx`, `sub_id` branch): replace the static
  panel with the ledger entry form + live progress (records entered / range size, from
  the existing count) + success flash. Reuse a new shared
  `components/ledger-customer-form.tsx` (fields: account_no*, first/middle/surname,
  village, post, taluka, district, mobiles, model_no, purchase_date*, loan_amount,
  installment, tenure, bank). `createCustomerAction` becomes role-aware on redirect:
  `sub_id` → back to `/dashboard?ok=…` (don't send sub-IDs to the customer card — they
  lack read policies on vehicles/loans); employee/admin → `/dashboard/customers/{id}`.
- **Employee "Add new customer"** page reuses the same `ledger-customer-form` (keeps
  RC/engine/guarantor in an optional collapsed section).
- **Customers page = installment registry entry**
  (`app/dashboard/customers/page.tsx`): keep search + list; show each row's colored
  status (computed from `purchase_date` + paid count via the TS helper); clicking opens
  the customer card.
- **Customer card → "EMI History" tab** (`app/dashboard/customers/[id]/page.tsx`):
  fill the currently-empty tab with the **payment grid** (serial = row index, date,
  month, installment, penalty, total, receipt no, signature) + an **"Add installment"**
  form (server action → `log_payment`) + a **follow-up log** (list of {note, time} +
  add-followup form). New `app/dashboard/customers/[id]/actions.ts` for the two writes.
- **Header colored badges** (`app/dashboard/layout.tsx`, admin/employee branch only):
  fetch `customer_status_counts()` and render 4 pills via a new
  `components/status-counts.tsx`; each links to `/dashboard/customers?status=<color>`
  (the customers page filters by the same months-behind logic). Show them in the desktop
  header next to the branch chip and in the mobile row.
- **Owner dashboard** (`app/dashboard/owner/page.tsx` + `owner/branches/[branchId]`):
  render the per-branch bucket counts from the extended `owner_branch_stats()`.

## Tests

- **Vitest (pure logic).** Add `vitest` + `vitest.config.ts` + scripts
  `"test": "vitest run"`, `"test:watch": "vitest"`. New `lib/loan-status.ts`:
  `monthsElapsed(purchaseDate, today)`, `expectedInstallments(purchaseDate, today,
  tenure)`, `monthsBehind(purchaseDate, today, tenure, paidCount)`,
  `categorize(behind) -> 'green'|'yellow'|'orange'|'red'`. `lib/loan-status.test.ts`
  covers boundaries (behind 0/1/2/3/4), tenure cap, same-month purchase, never-paid
  (paid=0). The Customers page + status RPC reuse this exact formula.
- **pgTAP (DB).** `supabase/tests/`: (a) duplicate `account_no` in same branch rejected,
  allowed across branches; (b) `sub_id` insert past range count rejected; (c)
  `customer_status_counts()` returns the right buckets for seeded purchase_date/payment
  combos and is branch-isolated; (d) `log_payment` inserts the right row and rejects the
  owner. Run with `npx supabase test db` (local stack). Enable `pgtap` in the test DB.

## Critical files

- New migrations: `supabase/migrations/20260609120000_ledger_fields.sql`,
  `supabase/migrations/20260609120100_ledger_rpcs.sql`
- `app/dashboard/page.tsx` (sub-ID form), `app/dashboard/customers/new/{page,actions}.tsx`
- `app/dashboard/customers/page.tsx`, `app/dashboard/customers/[id]/page.tsx`,
  new `app/dashboard/customers/[id]/actions.ts`
- `app/dashboard/layout.tsx`, `app/dashboard/owner/page.tsx`
- New `components/ledger-customer-form.tsx`, `components/status-counts.tsx`
- New `lib/loan-status.ts` (+ `.test.ts`), `vitest.config.ts`, `package.json` scripts
- `supabase/tests/*.sql`
- Docs: append the ledger model + new test commands to `docs/TESTING.md`,
  `docs/CLIENT_TESTING.md`, mark progress in `docs/PROJECT_REPORT.md`.

## Verification

1. `npm test` → Vitest green (boundary + bucket logic).
2. `npx supabase db push` applies both migrations cleanly.
3. `npx supabase test db` → pgTAP green (dedup, range, counts, log_payment, owner reject).
4. Manual, on the running dev server (new branch + Vercel preview per the feature-branch
   rule):
   - Owner creates Branch A & B each with its own admin → confirm isolation holds.
   - Sub-ID (Branch A) → ledger form → add customer; re-adding same account_no →
     friendly duplicate error; progress count increments; range cap still enforced.
   - Same account_no under Branch B → allowed (per-branch uniqueness).
   - Employee (Branch A) → Customers → search by name/mobile/account_no → open card →
     EMI History → add installment (penalty/receipt/signature) → row + total correct;
     add a follow-up → appears with timestamp.
   - Header shows green/yellow/orange/red counts for Branch A only; Branch B employee
     sees different counts; owner dashboard shows both branches' buckets.
