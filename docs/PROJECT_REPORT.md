# Vehicle Finance Loan Management System — 7-Day Phased Build Plan

## Context

The client needs a production web app to replace ~5,000 physical loan records (PRD_VehicleFinance_v2.md) within 6–7 days. The stack is locked (SystemDesign_VehicleFinance.md): **Next.js 14 App Router + Supabase + Vercel + cron-job.org**, all on free tier with documented upgrade paths. The directory is empty — we are initializing the project from scratch and there is no GitHub repo yet.

The build is sliced into **7 phases (one per day)**. Every phase ends with **something demoable to the client at a live Vercel preview URL**, so the client always has tangible progress to react to. Phases can be combined on faster days; later phases assume earlier ones are merged.

---

## Guiding Principles (apply in every phase)

- **Database-first business logic.** Penalty math, audit logging, soft-delete, sub-ID range checks, foreclosure calc, daily summary, pending list, bank recovery — all live as Postgres triggers / RPC functions. Next.js routes stay thin: validate → auth → `supabase.rpc()` → return.
- **No Edge runtime, no Vercel Cron** (Vercel free has no cron — using cron-job.org). All API routes are standard Node.js handlers.
- **RLS enforced at the DB level**, not just in UI — Admin / Employee / Sub-ID separation must hold even if a route handler is buggy.
- **Soft delete only** in v1; every write goes through the audit_log trigger.
- **Every phase ships a Vercel preview URL.** Client sees progress daily.

---

## Repository Setup (do once, before Phase 1 work)

1. `npx create-next-app@latest banking-app --ts --app --tailwind --eslint --src-dir=false --import-alias="@/*"`
2. `git init` + first commit (no GitHub remote yet — Vercel can deploy from a local git or we push to a new GitHub repo on Day 1; recommend creating a private GitHub repo on Day 1 since Vercel's nicest workflow is GitHub-connected previews).
3. Install: `@supabase/supabase-js @supabase/ssr zod react-hook-form lucide-react date-fns sonner`
4. Add shadcn/ui (`npx shadcn@latest init`) — covers form, table, dialog, badge, toast, tabs, dropdown.
5. Create Supabase project (free tier, region: closest to client — likely Mumbai/Singapore).

---

## Phase 1 — Day 1: Project Init + Live Vercel Link ✅ SHIPPED (2026-05-07)
**Demo URL:** Vercel preview being connected · Repo: `github.com/shubh7shubh/vehical_info`

**What shipped:**
- Next.js 16.2.5 (App Router) + Tailwind v4 + TypeScript scaffolded into repo root
- Brand tokens for Bank A (blue) / Bank B (green) — names swappable when client confirms (PRD Open Q #8)
- `/login` UI shell — branded sign-in form, button intentionally disabled (auth wires in Phase 2)
- `/dashboard` skeleton — header strip with 5 stats slots + 4 quick-access tiles (Pending, Bank Recovery, Daily Summary, Total Customers) per PRD §3.1
- `lib/supabase/server.ts` + `client.ts` via `@supabase/ssr` — placeholder env wired
- `middleware.ts` stub (Phase 2 will rename to `proxy.ts` per Next 16 convention and add session refresh + role gating)
- `CLAUDE.md` with hard architectural rules (no Edge runtime, no Vercel Cron, DB-first business logic, RLS mandatory, soft-delete only)
- `.env.local.example` with Supabase URL pre-filled, service role + anon + CRON_SECRET placeholders
- Local `.env.local` populated with real Supabase keys (gitignored)
- `next build` passes; routes `/`, `/login`, `/dashboard` generated

**Critical files shipped:**
- `app/(auth)/login/page.tsx`
- `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`
- `app/page.tsx` (redirects `/` → `/login`)
- `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/utils.ts`
- `middleware.ts` (stub)
- `CLAUDE.md`, `.env.local.example`, `docs/`

**Outstanding for Day 1 demo:** Vercel project import + env-var paste (user owns this).

---

## Phase 2 — Day 2: Auth + Schema + RLS + Role-Gated Dashboard 🚧 IN PROGRESS (2026-05-07)
**Demo:** Real admin / employee / sub-ID login with role-appropriate dashboards. Audit log automatically captures every DB write. Forbidden actions fail at the database (RLS), not just the UI.

### Defaults Applied (until client confirms PRD §8)
- Penalty default: `per_day` ₹50 (Open Q #2)
- Grace period default: 2 days (Open Q #7)
- Bank labels: "Bank A" / "Bank B" (Open Q #8) — overwritable in seed data with no schema change

### Database Schema — `supabase/migrations/20260507120000_schema.sql`
- `app_role` enum: `admin | employee | sub_id`
- `users` (id ↔ auth.users, email, role, sub_id_range_start/end, disabled_at)
- `banks` (id, name, color, created_at)
- `customers` (id, first_name, middle_name, last_name, address_taluka, address_village, mobiles text[], aadhaar, bank_id, created_by, created_at, updated_at, deleted_at)
- `vehicles` (customer_id, vehicle_name, rc_no UNIQUE, engine_no_1, engine_no_2, chassis_no)
- `guarantors` (customer_id, name, mobile, address)
- `loans` (id, customer_id, principal_paise, emi_paise, tenure_months, due_day, grace_days, penalty_type, penalty_rate_paise, status, started_at, closed_at)
- `payments` (id, loan_id, amount_paise, mode, utr, paid_at, recorded_by)
- `penalties` (id, loan_id, period_start, period_end, amount_paise, waived_by, waived_at)
- `seizures` (id, customer_id, amount_paise, notes, status, created_by, approved_by)
- `foreclosures` (id, loan_id, calculated_at, original_interest_paise, bank_charge_paise, final_payable_paise, paid_at, noc_issued_at)
- `documents_keys` (customer_id PK, key_status, key_handover_date, doc_status, doc_handover_date, bank_doc_status)
- `audit_log` (id, user_id, action, table_name, record_id, old_value jsonb, new_value jsonb, at)

All money stored as integer **paise** (avoid float). All FKs use `on delete restrict` — soft-delete is the only delete path.

### RLS Policies — `supabase/migrations/20260507120100_rls.sql`
Enabled on every table; policies map to PRD §5:
- Admin → full read/write everywhere
- Employee → read all (UTR masked via RPC return shape, not RLS); insert customers, vehicles, guarantors, loans, payments; **cannot** edit penalties, foreclosures, seizures (pending state), users
- Sub-ID → INSERT-only on customers/vehicles/guarantors, scoped to assigned numeric range, blocked when `disabled_at IS NOT NULL`

### Triggers — `supabase/migrations/20260507120200_triggers.sql`
- `audit_log_trigger()` — fires `AFTER INSERT/UPDATE/DELETE` on every table; captures `auth.uid()`, action, before/after as jsonb
- `handle_new_auth_user()` — `AFTER INSERT` on `auth.users` → creates matching `public.users` row with default role `employee`
- `set_updated_at()` — generic timestamp trigger applied to mutable tables
- `enforce_soft_delete()` pattern — DELETE intercepted, sets `deleted_at` instead

### Seed — `supabase/migrations/20260507120300_seed.sql`
- Inserts Bank A + Bank B with default colors
- Includes (commented) snippet to promote first user to admin: `update public.users set role='admin' where email='you@example.com';`

### App Wiring
- Rename `middleware.ts` → `proxy.ts` (Next 16) with Supabase session refresh + role gates: `/dashboard/admin/*` → admin only, `/dashboard/*` → any authenticated, `/login` → redirect away if already authed
- Login form converted to server action calling `supabase.auth.signInWithPassword`
- Logout button in dashboard header
- `lib/auth/current-user.ts` → `getCurrentUser()` returns `{ user, role, disabled, subIdRange }` from joined `auth.users` + `public.users`
- Dashboard nav reflects role; `/dashboard/admin` page stub created with placeholder for sub-ID + employee management (built out in Phase 6)

### How to Apply Migrations
1. Open Supabase Dashboard → SQL Editor
2. Run each migration file in order: `20260507120000_schema.sql` → `20260507120100_rls.sql` → `20260507120200_triggers.sql` → `20260507120300_seed.sql`
3. Create first user in **Authentication → Users → Add user** (email + password)
4. Run the admin-promotion snippet from the seed file with that user's email
5. Log into `/login` on Vercel preview — should land on admin dashboard

### Demoable Proof
- Log in as admin → full nav visible (Customers / Pending / Recovery / Summary / Admin)
- Create a second user, leave role as default `employee` → log in → no Admin nav, RLS blocks any update to penalties via direct REST API
- Open Supabase SQL Editor → `select * from audit_log` shows rows for every action taken

---

## Phase 2.5 — Admin User-Management Panel 🚧 IN PROGRESS (2026-05-07)
**Why:** The client doesn't use Supabase — they shouldn't need to open the Supabase Dashboard to add an employee, change a role, or disable an account. This slice pulls the user-management half of Phase 6 forward so the entire admin loop is demoable inside the app.

**Demo:** From the dashboard, an admin can add an employee, change a role, assign a sub-ID range, and disable an account. The newly created user can sign in immediately with no Supabase Dashboard interaction.

### Deliverables
- `lib/supabase/admin.ts` — service-role Supabase client (server-only)
- `app/dashboard/admin/users/page.tsx` — users list + "Add user" form
- `app/dashboard/admin/users/actions.ts` — server actions:
  - `createUserAction` — Auth Admin API + role/range patch
  - `setUserRoleAction`
  - `toggleUserDisabledAction`
  - `deleteUserAction`
- `app/dashboard/admin/page.tsx` — tiles wired to real routes

### Guardrails
- **Last-admin protection:** cannot demote, disable, or delete the only active admin
- **Self-modification protection:** cannot disable/demote/delete yourself
- **Service-role key** only used in server-only modules (never imported from client components)
- Email + password validated server-side via zod (valid email, password ≥ 8 chars)

### Phase 6 scope adjustment
- ❌ removed (shipped in Phase 2.5): create employee, change role, disable, delete
- ✅ stays in Phase 6: OTP gating, sub-ID range live progress + auto-disable, audit log viewer, soft-delete recovery UI, documents & key handling

### Demoable Proof
- Admin → `/dashboard/admin/users` → see all users, add `employee2@test.com` via the form → row appears
- Change role to `sub_id` with range `1–500`; sign in as that user in incognito → bulk-entry shell with the range visible
- Toggle disable → that user is blocked at next login
- Try to demote yourself → action returns an error, role unchanged

---

## Phase 2.7 — Multi-Branch Foundation 🚧 IN PROGRESS (2026-05-17)
**Why:** Client review changed the model. The business is **one company with
multiple physical branches**, not a single flat office. Each branch must run as
its own isolated unit — its own admin, staff, customers and loans — *separated
for visibility and security*. A new single top-level **owner** account oversees
every branch. This is foundational: it lands before Phase 3 so every later table
is branch-scoped from creation (same precedent as Phase 2.5 being lifted out of
Phase 6).

**Demo:** The owner logs into a cross-branch dashboard with live per-branch
stats, creates branches each with their own admin, and drills read-only into any
branch. A branch admin/employee sees only their own branch — a second branch is
invisible even via a direct database query (RLS), not just hidden in the UI.

### Model decided with the client
- One implicit company; a new `branches` table is the tenant unit (no
  "companies" table).
- `owner` — single global super-admin, `branch_id` NULL, sees all branches. The
  existing bootstrap admin is promoted to owner by the migration.
- Each branch is created with one admin; **more admins can be added later** —
  the last-admin guardrail is now per-branch.
- `banks` stays **company-wide / global** (shared Bank A / Bank B list). Recovery
  lists still come out per-branch because they derive from each branch's
  customers.
- Owner can: see aggregate stats, create/manage branches + their admins, and
  drill read-only into any branch's data.

### Database — `supabase/migrations/2026051709xxxx_*.sql` (6 files + RPC)
- `..._add_owner_role.sql` — `owner` added to the `app_role` enum (its own file —
  Postgres forbids using a freshly-added enum value in the same transaction).
- `..._branches_table.sql` — `public.branches` (name, code, city, soft-delete).
- `..._branch_id_columns.sql` — nullable `branch_id` + index on `users` and all 9
  operational tables + `audit_log`. `banks` deliberately excluded.
- `..._branch_backfill.sql` — seeds the **Main Branch**, backfills every existing
  row into it, promotes the oldest admin to `owner`, sets `branch_id` NOT NULL on
  operational tables, and adds the `users` CHECK (`role='owner' OR branch_id IS
  NOT NULL`).
- `..._rls_branch_scoped.sql` — `is_owner()` + `current_branch_id()` helpers;
  every operational policy gains `and branch_id = current_branch_id()`; one
  `*_owner_read` SELECT-only policy per table (owner read-only at the DB layer).
- `..._triggers_branch.sql` — `set_branch_id()` stamps `branch_id` on insert
  (from the user, or the parent row for child tables); `handle_new_auth_user`
  defaults new users to Main Branch; `audit_log_trigger` records `branch_id`;
  `enforce_sub_id_range` counts within the branch.
- `..._owner_stats_rpc.sql` — `owner_branch_stats()` security-definer RPC powering
  the owner dashboard.

### App wiring
- `lib/auth/current-user.ts` — `AppRole` gains `owner`; `CurrentUser` gains
  `branchId` / `branchName`; new `requireOwner()`.
- `proxy.ts` — gates `/dashboard/owner` to the owner; post-login landing routes
  owner → `/dashboard/owner`, everyone else → `/dashboard`.
- `app/dashboard/owner/*` — owner dashboard (per-branch stat cards),
  `owner/branches` (list + create-branch-with-admin + add-admin + archive),
  `owner/branches/[branchId]` (read-only drill-down).
- `app/dashboard/admin/users/*` — user list scoped to the admin's branch; created
  users join that branch; per-branch last-admin guardrail.
- `scripts/create-owner.mjs` — replaces `create-admin.mjs`; provisions the single
  owner, refuses if one already exists.

### Guardrails
- Owner has **no write policy** on operational tables — drill-down is read-only,
  enforced by RLS.
- An admin can never mint an `owner` (UI omits it; `users_admin_write` has
  `with check (role <> 'owner')`).
- Cross-branch reads/writes blocked by `branch_id = current_branch_id()` in every
  policy; `current_branch_id()` is NULL for the owner so owner matches only the
  `is_owner()` policies.
- Last active admin of a branch cannot be demoted/disabled/deleted.

### How to Apply
1. `npx supabase db push` — applies the 6 + 1 migration files in order.
2. If no prior admin existed, run `node scripts/create-owner.mjs <email> <pwd>`.
3. Phases 3–7 are now **branch-scoped** — see the table checklist in `CLAUDE.md`.

### Demoable Proof
- Owner logs in → `/dashboard/owner` with branch stat cards.
- Owner creates "Pune Branch" + "Mumbai Branch", each with its own admin.
- Pune admin signs in → sees only Pune; `/dashboard/owner` redirects away.
- A customer added under Pune is invisible to the Mumbai admin — confirmed by a
  direct `select` returning zero rows in the Supabase SQL Editor.

---

## Phase 3 — Customer Management + Smart Search + Customer Card ✅ SHIPPED (2026-05-17)
**Built on the `phase-3-customers` feature branch — the first phase under the
feature-branch flow — and merged to `main`.**
**Demo:** Inside a branch, add a customer (with vehicle, guarantor and loan),
search by name / RC / engine / mobile / Aadhaar, and open a full tabbed customer
card. Everything is branch-scoped — a branch only ever sees its own customers.

**What shipped:**
- **`create_customer(p jsonb)` RPC** — single transactional onboarding: writes
  customer + vehicle + guarantor + loan in one call; a partial failure rolls
  back. Global duplicate detection on RC number and engine number with friendly
  errors. Stamps the caller's branch on every row.
- **`search_customers(q text)` RPC** — security-invoker, so branch-scoped RLS
  applies automatically. Matches partial name, RC, engine, chassis, Aadhaar, or
  any mobile.
- **`/dashboard/customers`** — branch customer list (50 most recent) + the smart
  search surface; `?q=` runs the RPC. Multiple matches show a disambiguation
  hint (village + mobile) per PRD AC-03.
- **`/dashboard/customers/new`** — full onboarding form (Customer / Vehicle /
  Guarantor / Loan sections), zod-validated, mobile-first 16px inputs.
- **`/dashboard/customers/[id]`** — tabbed customer card (Customer / Vehicle /
  Guarantor / Loan / EMI History / Foreclosure-Seizure / Documents & Keys).
  URL-based tabs (`?tab=`), no client JS, mobile-scrollable. EMI / status / docs
  tabs show honest empty states until Phases 4–6 fill them.
- **"Record incomplete" badge** on the list and card when engine numbers are
  missing.
- Smart-search bar added to the dashboard home (`components/customer-search.tsx`).

**Critical files:**
- `supabase/migrations/20260517093000_customer_rpcs.sql`
- `app/dashboard/customers/{page,new/page,new/actions,[id]/page}.tsx`
- `components/customer-search.tsx`

**Open Question #4 (tabs vs sections):** built as tabs — cleaner on mobile.

**UX shipped alongside (cross-cutting):**
- `loading.tsx` skeletons for every dashboard section — instant feedback on
  navigation (`components/loading-skeleton.tsx`).
- Top progress bar on every in-app navigation (`components/top-progress.tsx`,
  mounted in the root layout).

**Hotfix during this phase:** `getCurrentUser()` embedded `branches(name)`,
which is ambiguous because `users` and `branches` share two foreign keys —
it broke sign-in with a redirect loop. Fixed to a plain select + separate
branch-name lookup.

---

## Phase 4 — Ledger Entry + Installment Registry + Reminder Counts ✅ SHIPPED (2026-06-09)
**Built on the `phase-4-ledger-registry` feature branch.**
**Demo:** A sub-ID bulk-enters loan-book customers (deduped by account number);
an employee searches a customer and records monthly installments + follow-ups;
the header shows 4 colour-coded reminder counts so staff know who to chase — all
branch-scoped, with the owner seeing every branch's buckets.

> Client review reshaped Phase 4 around the **physical loan book** (one ledger row
> per customer + a monthly payment grid). This slice delivers the data model,
> the sub-ID entry UI (pulled forward from Phase 6), the installment registry and
> the reminder triage. The **automatic** penalty engine + `pg_cron` sweep and the
> 0/1/3/5 pending-list bands remain for a later slice (see "Deferred" below).

**What shipped:**
- **Schema extended to the ledger** (`20260609120000_ledger_fields.sql`, additive):
  `customers` gains `account_no` (unique **per branch**), `address_post`,
  `address_district`, `model_no`, `purchase_date`; `payments` gains `month_no`,
  `penalty_paise`, `receipt_no`, `signature` (total = installment + penalty,
  derived); new branch-scoped **`followups`** table (the per-customer follow-up
  log — an array of {note, time}) with the full Phase 3+ checklist (branch_id NOT
  NULL, `set_branch_id` arm, index, RLS + `followups_owner_read`, audit trigger).
- **RPCs** (`20260609120100_ledger_rpcs.sql`): `create_customer` extended with the
  ledger fields + **per-branch account-number dedup** + purchase-date-anchored
  schedule; **`log_payment`** (the registry write — employee/admin only, owner
  rejected); **`customer_status_counts()`** (the 4 buckets, security-invoker so
  branch-scoped); `owner_branch_stats()` extended with per-branch buckets;
  `search_customers` now also matches/returns the account number. Shared month
  math lives in `months_elapsed()`.
- **Reminder buckets (pure months-behind):** 0 → green, 1–2 → yellow, 3 → orange,
  >3 → red — the same rule in Postgres and in `lib/loan-status.ts`.
- **Sub-ID dashboard** is now a real **loan-book entry form** with live
  Entered/Remaining progress and a success flash (was a static range panel).
- **Installment registry** lives on the customer card's **EMI History** tab:
  status badge, "Paid X of Y", add-installment form (`log_payment`), the payments
  grid, and the follow-up log (add + newest-first list).
- **Header reminder pills** (admin/employee) link to the customers list filtered
  by colour; the customers list shows each row's `A/c` number + colour badge; the
  **owner dashboard** shows each branch's buckets.
- **Tests:** Vitest unit suite for the bucket/date logic (`npm test`, 15 cases)
  + pgTAP DB suite (`npx supabase test db`) covering dedup, the per-branch
  uniqueness, the sub-ID range cap, the status buckets and the owner-reject rule.
  Time is **simulated** (backdated `purchase_date` + seeded payments) — no waiting
  a real month.

**Critical files:**
- `supabase/migrations/20260609120000_ledger_fields.sql`,
  `supabase/migrations/20260609120100_ledger_rpcs.sql`
- `lib/loan-status.ts` (+ `.test.ts`), `vitest.config.ts`,
  `supabase/tests/ledger_test.sql`
- `components/ledger-customer-form.tsx`, `components/status-counts.tsx`
- `app/dashboard/page.tsx`, `app/dashboard/layout.tsx`,
  `app/dashboard/customers/{page,new/page,new/actions,[id]/page,[id]/actions}.tsx`,
  `app/dashboard/owner/page.tsx`

**Decisions (confirmed with client):** extend (not flatten) the schema; pure
months-behind buckets; account number is the dedup key (sub-ID range stays a count
cap); penalty is entered manually per installment row (matches the book).

**Deferred to a later slice:** automatic penalty accrual
(`apply_penalty_on_payment()` trigger + `pg_cron` daily sweep) and the
0/1/3/5/Below-3/Above-5 pending-list page. The reminder buckets already provide
overdue triage in the meantime.

> **Superseded in Phase 4.5:** the months-behind math is now anchored on the new
> `loans.first_emi_date` rather than `purchase_date` directly, and the penalty is
> monthly fixed ₹500 (pre-filled on the installment form) instead of a blank box.

---

## Phase 4.5 — Client Feedback Round 2 ✅ SHIPPED (2026-08-02)
**Built on the `phase-4.5-client-feedback` feature branch.**
**Demo:** A customer walks in, staff finds them and taps **Record EMI** straight
from the list, the ₹500 penalty is pre-filled for the months they're late, and
one click prints an A5 receipt showing **Paid 2 of 12 · PENDING 10**. Every page
has a Back button, every customer page has Edit / Print / Invoice Print, and the
First EMI date fills itself in when the loan date is entered.

> The client tested the Phase 4 build and sent 8 changes (in Marathi). Two of
> them settle PRD §8 open questions outright.

**What the client asked for, and what shipped:**

| # | Request | Delivered |
|---|---|---|
| 1 | Printable invoice for every EMI payment | `/dashboard/customers/[id]/receipt/[paymentId]` — A5 slip, two copies (Office / Customer) per A4 sheet |
| 2 | Recording an EMI must be findable | **Record EMI** button on every customers-list row, on the customer card, and a dashboard quick tile. Tab renamed `EMI History` → `EMI / Payments` |
| 3 | Back button on every page | `components/back-button.tsx`, mounted once in the dashboard layout |
| 4 | Receipt must show EMIs still pending | `Paid X of Y · PENDING Z` + next due date on the slip, computed by `payment_receipt()` |
| 5 | First EMI date auto-fills from the loan date | New `loans.first_emi_date` + `components/emi-date-fields.tsx` (auto = purchase + 1 month, editable, "Reset to automatic") |
| 6 | Penalty is monthly ₹500 | `loans` defaults → `monthly_fixed` / 50000 paise; the installment form pre-fills ₹500 × months behind, still editable |
| 7 | Real bank names | `Bank A → Dhanshree Bank`, `Bank B → Bhagyalaxmi Bank` (rename, so existing `bank_id` links survive) |
| 8 | Edit / Print / Invoice Print on the customer page | Action bar on the card; new `[id]/edit` route + `update_customer()` RPC; new `[id]/print` A4 statement |

**Database** (`20260802120000_penalty_banks_first_emi.sql`, `20260802120100_receipt_edit_rpcs.sql`):
- `loans` gains `first_emi_date` (nullable; readers fall back to
  `purchase_date + 1 month`) and new penalty defaults, with existing loans still
  on the old defaults backfilled.
- `payments` gains `invoice_no` — a unique, system-generated `INV-000123` from a
  sequence. `receipt_no` remains the hand-written number from the physical book;
  the slip prints both.
- New **`installments_due(first_emi, purchase, tenure, as_of)`** is now the single
  schedule helper: installment 1 is due *on* the first-EMI date, capped at tenure.
  `customer_status_counts()` and `owner_branch_stats()` were re-anchored onto it.
  With the default first EMI this is arithmetically identical to the old
  purchase-anchored math — **no customer changed colour**.
- New **`payment_receipt(payment_id)`** (security invoker, so existing branch RLS
  applies) returns branch + customer + loan + payment + paid/pending counts in one
  call. Counts are *as of that payment*, so a reprint stays historically correct.
- New **`update_customer(p jsonb)`** (security definer, admin/employee, own branch
  only). This is what lets an **employee** edit — the RLS UPDATE policies are
  admin-only, and were left untouched. Dedup checks exclude the row being edited;
  tenure cannot drop below the installments already recorded; payments are never
  touched. Edits are audited automatically by the existing trigger.

**Frontend:**
- Printing uses Tailwind's `print:` variant plus one `@media print` block in
  `app/globals.css` — no separate print layout. Header, nav, progress bar and all
  buttons carry `print:hidden`.
- `lib/customer-form.ts` now holds the zod schema + jsonb payload shared by the
  add and edit actions, so the two can't drift.
- `LedgerCustomerForm` takes `action` / `defaults` / `customerId`, serving add,
  sub-ID bulk entry and edit from one component.
- Flash messages moved out of the EMI tab so an edit confirmation is visible on
  whichever tab you land on.

**Critical files:**
- `supabase/migrations/20260802120000_penalty_banks_first_emi.sql`,
  `supabase/migrations/20260802120100_receipt_edit_rpcs.sql`
- `app/dashboard/customers/[id]/{page,actions}.tsx`,
  `app/dashboard/customers/[id]/{edit,print,receipt/[paymentId]}/page.tsx`
- `components/{back-button,print-button,emi-date-fields,form-styles}.tsx`,
  `components/ledger-customer-form.tsx`
- `lib/{loan-status,customer-form}.ts`, `app/globals.css`

**Tests:** Vitest 34 cases (`npm test`); pgTAP 38 assertions
(`npx supabase test db`) now also covering `installments_due`, the bank rename,
the ₹500 defaults, first-EMI derivation, `invoice_no`, historical
`payment_receipt` counts, and `update_customer` (employee allowed, self-excluded
dedup, tenure guard, cross-branch rejected, owner rejected).

**PRD open questions closed:** #2 (penalty = monthly fixed ₹500), #8 (bank names).
#5 (export/print) partly — receipts and statements print; Excel/PDF export is
still open.

**Still deferred:** automatic penalty *accrual* (`pg_cron` sweep — today the ₹500
is a suggestion the employee confirms) and the 0/1/3/5/Below-3/Above-5 pending
list page.

---

## Phase 5 — Day 5: Bank Recovery + Daily Summary + Foreclosure + Seizure
**Demo:** Two color-coded bank recovery lists, end-of-day summary screen, foreclosure calculator, seizure entry with admin approval state.

- `get_bank_recovery_list(bank_id)` RPC; auto grow/shrink as customers added/closed.
- `get_daily_summary(date)` RPC: cash list, online list (UTR masked for employees), totals, pending, penalty totals.
- `calculate_foreclosure(loan_id)` RPC: remaining months, original interest, reduction, bank charge, final payable.
- Seizure module: employee creates entry → status `pending` → Admin approves (OTP comes in Phase 6).
- NOC + key handover status visible on foreclosure screen.

---

## Phase 6 — Day 6: OTP Gating + Sub-ID Monitoring + Audit Viewer + Soft Delete + Docs/Keys
**Demo:** Admin actions (penalty edit, foreclosure, seizure approval) require email OTP. Sub-ID range usage is visible live and auto-disables when full. Deleted records show in a recovery view.

> Note: basic user create / role-change / disable / delete shipped in **Phase 2.5**. Phase 6 focuses on the deeper monitoring + safety features below.

- Email OTP flow via Supabase Auth: `/api/auth/otp` issues, RPC verifies token before mutation.
- `validate_sub_id_range()` trigger hardening (already partial in Phase 2 trigger) + auto-disable when range filled (RPC `mark_sub_id_complete`).
- Sub-ID **monitoring** page: live progress bar (records entered / range size), spot-check helper, "complete batch" button.
- Audit log **viewer** UI — paginated table, filter by user / table / action.
- Soft-delete trigger (sets `deleted_at`); 30-day recovery UI for Admin.
- Documents & Key handling section editable by Admin, view-only for Employee.

---

## Phase 7 — Day 7: Realtime, cron-job.org, PWA Polish, UAT
**Demo:** Run through all 12 PRD acceptance criteria with the client. Live updates across tabs.

- Supabase Realtime on dashboard counters (pending counts, daily summary totals) and bank recovery lists.
- `/api/health` (cron-job.org daily ping to keep Supabase awake) + `/api/penalty` fallback (only used if `pg_cron` is disabled).
- Configure cron-job.org with `CRON_SECRET` header.
- Mobile responsiveness sweep + PWA manifest (Open Question #9 — PWA in v1).
- Performance: paginate customer list, add Postgres indexes (rc_no, engine_no, mobiles, full_name trigram).
- UAT walkthrough against PRD §9 AC-01 to AC-12 with the client; track pass/fail in a checklist.

---

## CLAUDE.md (proposed content for repo root)

```markdown
# Vehicle Finance Loan Management System

Internal ops platform replacing physical loan books for ~5,000 customers.
Source of truth: `PRD_VehicleFinance_v2.md`, `SystemDesign_VehicleFinance.md`.

## Stack
- Next.js 14 App Router (TypeScript, Tailwind, shadcn/ui)
- Supabase: Postgres + Auth + RLS + Realtime + pg_cron
- Vercel (Hobby) deployment, cron-job.org for anti-pause + penalty fallback

## Hard Architectural Rules
- **No Edge runtime.** Never use `export const runtime = 'edge'`. All routes are standard Node.js.
- **No Vercel Cron** (not on Hobby). Use cron-job.org or `pg_cron` inside Supabase.
- **Business logic lives in Postgres.** Penalty calc, audit logging, soft-delete,
  sub-ID range check, foreclosure, daily summary, pending list, bank recovery
  are DB triggers / RPC functions. API routes only validate, check auth, call
  `supabase.rpc()`, return.
- **RLS is mandatory** on every table — never rely on UI/middleware alone for access.
- **Soft delete only.** Every table has `deleted_at`; never hard delete in v1.
- **Audit log trigger** runs on every INSERT/UPDATE/DELETE.
- **OTP-gated admin actions:** penalty edit/waive, foreclosure, seizure approval.

## Roles
- `admin` — full access, sees full UTR, manages sub-IDs, approves OTP-gated actions
- `employee` — add customers, log payments, view (UTR masked), no penalty edits
- `sub_id` — temporary, INSERT-only, scoped to assigned record-range, auto-disabled

## Folder Layout
- `app/api/*` — thin route handlers (Node runtime)
- `app/(auth)/*`, `app/(dashboard)/*` — UI route groups
- `lib/supabase/{server,client}.ts` — typed clients
- `lib/utils/*` — formatters, masking helpers
- `supabase/migrations/*.sql` — schema, RLS, triggers, RPCs (source of truth)

## Conventions
- Server actions for forms; Route handlers for cron + JSON APIs
- All money fields stored as integer paise (avoid float)
- All timestamps UTC; render IST in UI
- Bulk entry: ≤50 records per request (Vercel Hobby 10s timeout)
- UTR masked client-side for employees AND server-side via RPC return shape

## Open Questions Tracked in PRD §8
Defer answers but design flexibly for: penalty per-customer config (#2),
search scope (#3), grace period (#7), bank names (#8), export formats (#5).
```

---

## Verification Strategy

- **Per phase:** Click through Vercel preview, verify the day's demo. No phase ships without a working preview URL.
- **Per RPC / trigger:** Test directly in Supabase SQL Editor with seed rows before wiring to UI.
- **Phase 7 UAT:** Walk PRD §9 AC-01 through AC-12 with the client; capture pass/fail; fix blockers same-day.
- **RLS verification:** Log in as each role in different browsers and confirm forbidden actions fail server-side, not just in UI.
- **Realtime check:** Two browser tabs as same admin → action in tab A reflects in tab B without reload.

---

## Critical Files to Create / Modify (cross-phase)

- `app/api/customers/route.ts`, `app/api/customers/[id]/route.ts`
- `app/api/payments/route.ts`
- `app/api/foreclosure/route.ts`, `app/api/seizure/route.ts`
- `app/api/daily-summary/route.ts`
- `app/api/auth/otp/route.ts`
- `app/api/health/route.ts`, `app/api/penalty/route.ts`
- `app/(dashboard)/customers/[id]/page.tsx` — customer card
- `app/(dashboard)/pending/page.tsx`, `app/(dashboard)/recovery/page.tsx`, `app/(dashboard)/summary/page.tsx`
- `app/(dashboard)/admin/sub-ids/page.tsx`, `app/(dashboard)/admin/audit/page.tsx`
- `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_triggers.sql`, `0004_rpcs.sql`, `0005_pg_cron.sql`
- `middleware.ts` — session + role gate
- `lib/utils/penalty.ts`, `lib/utils/utr-mask.ts`, `lib/utils/money.ts`
- `CLAUDE.md`, `.env.local.example`

---

## Risks / Things to Flag Early

1. **PRD §8 Open Questions #2, #3, #7, #8 are blockers** — get answers Day 1 to avoid rework on penalty config, bank labels, grace period.
2. **Vercel Hobby 10s timeout** — bulk historical entry must batch ≤50 records (system design §4).
3. **Free-tier Supabase pause** — cron-job.org ping must be live by Day 7 or sooner.
4. **OTP UX on shared admin email** — confirm if multiple admins use one email or separate; affects flow.
5. **Mobile testing** — must test on actual phones, not only browser devtools, before Phase 7 sign-off.
