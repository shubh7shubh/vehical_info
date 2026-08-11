# Testing Guide
## Vehicle Finance Loan Management System

This document describes how to verify each phase end-to-end. Run through it after every deploy.

---

## Prerequisites

- `.env.local` populated with real Supabase keys (see `.env.local.example`)
- All migrations applied (run `npx supabase db push` after `supabase link`)
- Dev server running: `npm run dev` → http://localhost:3000

Useful Supabase Dashboard URLs (replace project ref if it changes):
- Users: https://supabase.com/dashboard/project/szebgodbabwluaxowhvz/auth/users
- SQL Editor: https://supabase.com/dashboard/project/szebgodbabwluaxowhvz/sql/new
- Table Editor: https://supabase.com/dashboard/project/szebgodbabwluaxowhvz/editor

---

## Automated tests

Two layers, both runnable on demand — you never have to wait a real month for an
installment to come due (see the "simulating time" note in Phase 4).

### Unit tests — Vitest (pure logic, no DB)

```bash
npm test          # one-shot
npm run test:watch
```

Covers `lib/loan-status.ts` — the schedule math and the 4 reminder buckets
(`monthsElapsed`, `expectedInstallments`, `monthsBehind`, `categorize`). These
are the exact rules the header counts, the customers list and the DB RPC all use,
so a green run means the colour logic is correct at every boundary
(0 → green, 1–2 → yellow, 3 → orange, >3 → red).

### Database tests — pgTAP (RPCs, triggers, RLS)

Requires the local stack (Docker):

```bash
npx supabase start      # first run pulls images
npx supabase test db    # runs supabase/tests/*.sql
```

`supabase/tests/ledger_test.sql` proves, against a real Postgres:
`months_elapsed()`, the `customer_status_counts()` buckets, **per-branch**
account-number dedup (same number allowed in a different branch), the sub-ID
range cap, `create_customer` duplicate rejection, and that `log_payment` lets an
employee record an installment but **rejects the owner** (read-only). Time is
simulated by backdating `purchase_date` and seeding a payment history — nothing
is waited for.

---

## Phase 2 — Auth + Schema + RLS + Role-Gated Dashboard

> **Bootstrap only:** sections 1–2 are needed exactly once, to create the very first admin. After that, every additional user is created from the in-app **Admin → Users** panel (see Phase 2.5). The client never needs to open Supabase again.

### 1. Create the bootstrap admin user (Supabase Dashboard, one-time)

1. Open the **Auth → Users** page in Supabase Dashboard
2. Click **Add user → Create new user**
3. Enter email + password
4. Tick **Auto Confirm User** (skips email verification)
5. Click **Create user**

> The `handle_new_auth_user` trigger automatically creates a matching row in `public.users` with default role `employee`.

### 2. Promote the bootstrap user to admin (SQL Editor, one-time)

```sql
update public.users set role = 'admin'
where email = 'YOUR_ADMIN_EMAIL@example.com';

select id, email, role from public.users;
```

The user should now appear with `role = admin`. From here on, use Phase 2.5's admin panel for everything.

### 3. Test the admin flow

1. Open http://localhost:3000 → automatically redirected to `/login`
2. Sign in with the admin email + password
3. ✅ Land on `/dashboard`
4. ✅ Email and `admin` role badge appear top-right
5. ✅ Nav contains `Dashboard / Customers / Pending / Bank Recovery / Daily Summary / Admin`
6. Click **Admin** → `/dashboard/admin` opens with the Admin Console
7. Click **Sign out** → back to `/login`

### 4. Test the employee flow (proves role gating works)

1. **Use the admin panel** to add `employee@test.com` (see Phase 2.5 § 2). Leave role as `Employee`.
2. Open an **incognito window** and sign in as that user
3. ✅ No **Admin** link in nav
4. ✅ Role badge shows `employee`
5. Manually visit http://localhost:3000/dashboard/admin
6. ✅ You should be redirected back to `/dashboard` (proxy.ts blocks non-admins)

### 5. Test the sub-ID flow

1. **Use the admin panel** to add `subid1@test.com` with role `Sub-ID`, range `1 – 500` (see Phase 2.5 § 2–3)
2. Sign in as that user
3. ✅ Stripped-down "Bulk Data Entry" screen appears (no main nav, no tiles)
4. ✅ Assigned range `1 – 500` is shown

### 6. Verify the audit log

In SQL Editor:

```sql
select user_id, action, table_name, at
from public.audit_log
order by at desc
limit 20;
```

✅ Rows should appear for every user role update, customer insert, etc. — proving the `audit_log_trigger` is firing.

### 7. Verify RLS enforcement (optional, for the client demo)

Sign in as the employee user, then in SQL Editor (with the employee's session):

```sql
update public.penalties set amount_paise = 0 where id = '<any-id>';
```

✅ Should return zero rows updated or an RLS error — penalties cannot be edited by employees, only admins.

---

## Phase 2.5 — Admin User-Management Panel

> Goal: prove the admin can run the full user lifecycle from inside the app, with no Supabase Dashboard access. After the bootstrap admin from Phase 2 § 1–2, every other user (employee, sub-ID, additional admin) is created here.

### 1. Open the Users page
1. Sign in as admin → top nav → click **Admin** → click the **Users** tile (or visit `/dashboard/admin/users`)
2. ✅ Your own row appears, marked `(you)`, with role `admin` and status `Active`
3. Visiting the same page as an employee should redirect to `/dashboard` (proxy gate)

### 2. Create a user via the form
1. Fill: email `employee2@test.com`, password `Test1234!`, role `Employee`
2. Click **Add user**
3. ✅ Green "Created employee2@test.com" banner appears, the row shows up below
4. Sign in as `employee2@test.com` in incognito → ✅ lands on dashboard with `employee` badge, no Admin nav
5. Negative case: try the form with password `short` → ✅ red banner "Password must be at least 8 characters"
6. Negative case: submit with email `not-an-email` → ✅ red banner with a validation error

### 3. Sub-ID role + range
1. In the row for `employee2@test.com`, change role select to `Sub-ID`, set start `1`, end `500`, click **Save**
2. ✅ Status row updates, Range column reads `1 – 500`
3. Sign in as `employee2@test.com` in incognito → ✅ stripped-down "Bulk Data Entry" screen with `Range: 1 – 500`
4. Negative case: try saving role `Sub-ID` with end `100` and start `500` (or empty range) → ✅ red banner "Sub-ID requires a valid range (start ≤ end)"

### 4. Disable / Enable
1. Back as admin → click **Disable** on `employee2@test.com`
2. ✅ Status badge flips to `Disabled`
3. In incognito, employee2 attempts sign-in → ✅ redirected back to `/login` (`requireUser` rejects disabled accounts)
4. Click **Enable** → status goes back to `Active`, employee2 can sign in again

### 5. Guardrails
1. Try to change your own role from `admin` to `employee` → ✅ red banner: "You cannot demote yourself"
2. ✅ The **Disable** button on your own row is greyed out and unclickable
3. ✅ The **Delete** button on your own row is greyed out and unclickable
4. If you're the only admin in the system, try to demote any admin row → ✅ red banner: "Cannot demote the only active admin"
5. If you're the only admin, try to disable that admin → ✅ red banner: "Cannot disable the only active admin"

### 6. Delete
1. Click **Delete** on `employee2@test.com` → row disappears, green "User deleted" banner shows
2. Supabase Dashboard → **Auth → Users** → ✅ that user is also gone (auth row deleted; the `on delete cascade` removed the `public.users` row too)
3. SQL Editor: `select * from public.users where email='employee2@test.com';` → ✅ zero rows

### 7. Audit-trail spot check
After a few admin operations above, in SQL Editor:

```sql
select user_id, action, table_name, new_value->>'role' as role, at
from public.audit_log
where table_name = 'users'
order by at desc
limit 10;
```

✅ Should show INSERT (from `handle_new_auth_user`), UPDATE rows for each role/range/disable change, and DELETE rows for any deletions — all with the admin's `user_id`.

---

## Phase 2.7 — Multi-Branch Foundation

> Goal: prove the company is split into isolated branches, that the single
> `owner` oversees them all, and that a branch admin/employee can only ever see
> their own branch — enforced at the database (RLS), not just the UI.

### 0. Apply the migration

1. `npx supabase db push` — the 6 branch migrations + the owner-stats RPC apply
   in filename order. Watch for errors; the order matters (enum → table →
   columns → backfill → RLS → triggers).
2. In SQL Editor, sanity-check the backfill:

   ```sql
   select role, count(*) from public.users group by role;            -- exactly one 'owner'
   select count(*) from public.customers where branch_id is null;    -- 0
   select name, code from public.branches;                           -- 'Main Branch' / 'MAIN'
   ```

### 1. Bootstrap the owner

- If a Phase 2 bootstrap admin already existed, the migration **already promoted**
  the oldest admin to `owner` — skip ahead.
- On a clean install with no prior admin:
  `node scripts/create-owner.mjs owner@test.com Test1234!`
  ✅ Prints "is now the owner". Running it a second time ✅ refuses ("An owner
  already exists").

### 2. Owner dashboard

1. Sign in as the owner → ✅ lands on `/dashboard/owner` (not `/dashboard`).
2. ✅ Header nav shows only **Dashboard** and **Branches**; role badge `owner`.
3. ✅ "Owner Overview" with summary tiles (Branches / Customers / Active loans /
   Staff). With no branches yet it shows a "Create your first branch" prompt.

### 3. Create branches

1. Go to **Branches** → fill the "Create branch" form: name `Pune Branch`, code
   `PUN`, city `Pune`, admin email `pune.admin@test.com`, password `Test1234!`.
   Click **Create branch**.
2. ✅ Green banner; a Pune Branch card appears listing `pune.admin@test.com`
   under Admins.
3. Repeat for `Mumbai Branch` / `MUM` with admin `mumbai.admin@test.com`.
4. Negative case: submit with admin password `short` → ✅ red banner "Admin
   password must be at least 8 characters".

### 4. Branch isolation

1. Incognito → sign in as `pune.admin@test.com`.
2. ✅ Dashboard shows the **Pune Branch** chip; nav has **Admin** but no owner
   links. Visiting `/dashboard/owner` ✅ redirects to `/dashboard`.
3. **Admin → Users** → ✅ lists only Pune staff (the Pune admin). Add
   `pune.emp@test.com` as Employee → ✅ created in Pune.
4. Incognito → sign in as `mumbai.admin@test.com` → **Admin → Users** → ✅
   `pune.admin@test.com` and `pune.emp@test.com` are **not** listed.
5. RLS proof — in SQL Editor with the Mumbai admin's session, try to read a Pune
   row directly:

   ```sql
   select * from public.users where email = 'pune.emp@test.com';   -- 0 rows
   ```

   ✅ Zero rows — isolation holds at the database, not just the UI.

### 5. Owner drill-down is read-only

1. As owner → `/dashboard/owner` → click the **Pune Branch** card.
2. ✅ Branch detail shows stat tiles, the staff list, and recent activity.
3. ✅ The owner has no controls to edit branch data here — drill-down is
   read-only. (DB check: the owner has only `*_owner_read` SELECT policies on
   operational tables.)

### 6. Per-branch last-admin guardrail

1. As the Pune admin (the only admin in Pune), on your own row try to demote
   yourself → ✅ "You cannot demote yourself"; Disable/Delete greyed out.
2. As owner → **Branches** → on Pune Branch use **Add admin** to add
   `pune.admin2@test.com`.
3. Now back as a Pune admin, demoting/disabling the first Pune admin ✅ succeeds
   — the guardrail only blocks removing the *last* admin **of that branch**.

### 7. Archive a branch

1. As owner → **Branches** → click **Archive** on a test branch → ✅ card shows
   the **Archived** badge; **Restore** brings it back.

### 8. Audit trail

In SQL Editor:

```sql
select table_name, action, branch_id, at
from public.audit_log
order by at desc
limit 20;
```

✅ Branch/customer/user rows carry a `branch_id`; the `branches` INSERT rows
themselves may have `branch_id` set to the branch's own id. Owner-level events
are attributable to the owner's `user_id`.

---

## Phase 3 — Customer Management & Smart Search

> Goal: prove a branch can onboard customers, find them by any identifier, and
> open a complete customer card — all scoped to the signed-in user's branch.

### 0. Apply the migration

`npx supabase db push` — applies `20260517093000_customer_rpcs.sql` (the
`create_customer` and `search_customers` functions). It is additive — no table
or RLS changes.

### 1. Onboard a customer

1. Sign in as a branch admin or employee → top nav **Customers** → **Add
   customer** (or visit `/dashboard/customers/new`).
2. Fill at least: first name, a bank, loan amount, EMI, tenure, due day, start
   date. Add vehicle + guarantor details too. Click **Save customer**.
3. ✅ Redirects to the new customer's card showing the entered details.
4. SQL Editor check — one call wrote four rows:

   ```sql
   select c.first_name, v.rc_no, g.name, l.principal_paise
   from public.customers c
   left join public.vehicles v on v.customer_id = c.id
   left join public.guarantors g on g.customer_id = c.id
   left join public.loans l on l.customer_id = c.id
   order by c.created_at desc limit 1;
   ```

5. Negative — duplicate: add another customer reusing the same **RC number** →
   ✅ red banner "A vehicle with RC number … already exists" and **nothing** is
   saved (transactional rollback — no orphan customer row).
6. Negative — leave engine numbers blank → ✅ customer saves, and both the list
   and card show a **Record incomplete — engine details missing** badge.

### 2. Smart search

On `/dashboard/customers` (or the search bar on the dashboard home), search by
each of these and confirm the customer is found:

- ✅ Partial first name / surname
- ✅ RC number
- ✅ Engine number
- ✅ Mobile number
- ✅ Aadhaar / ID

When two customers share a name, ✅ both appear with a disambiguation hint
(village + mobile) — PRD AC-03.

### 3. Customer card

1. Open any customer → ✅ tab strip: Customer / Vehicle / Guarantor / Loan /
   EMI History / Foreclosure-Seizure / Documents & Keys.
2. ✅ Customer / Vehicle / Guarantor / Loan tabs show the saved data. Loan tab
   shows amount, EMI, tenure, due day, grace, penalty config.
3. ✅ EMI / Foreclosure-Seizure / Documents tabs show empty states (filled in
   by Phases 4–6).
4. ✅ On a phone the tab strip scrolls horizontally; no content is cut off.

### 4. Branch isolation

1. As the **Pune** admin, add customer "Test Pune".
2. Sign in as the **Mumbai** admin → search "Test Pune" → ✅ no result.
3. Try opening the Pune customer's card URL (`/dashboard/customers/<id>`) as the
   Mumbai admin → ✅ "not found" — RLS blocks the cross-branch read.

---

## Phase 4 — Ledger Entry + Installment Registry + Reminder Counts

> Goal: prove a sub-ID can bulk-enter loan-book customers (deduped), an employee
> can record monthly installments and follow-ups against a customer, and the
> header shows the 4 colour-coded reminder counts — all branch-scoped, with the
> owner seeing every branch's buckets.

### 0. Apply the migrations

`npx supabase db push` — applies `20260609120000_ledger_fields.sql` (new customer
/ payment columns + the `followups` table) and `20260609120100_ledger_rpcs.sql`
(extended `create_customer`, `log_payment`, `customer_status_counts`, owner
buckets). Additive — no existing data is touched.

### Simulating time (read this first)

A customer's reminder colour is computed from **`purchase_date` vs. today**, so
you never wait for a real month to pass. To make a customer look 3 months behind,
set their **purchase date 3 months in the past** and log fewer installments than
are due. Examples below use this.

| Want to see… | Purchase date | Installments logged |
|---|---|---|
| 🟢 green (on time) | 5 months ago | 5 |
| 🟡 yellow (1–2 behind) | 5 months ago | 3 |
| 🟠 orange (3 behind) | 5 months ago | 2 |
| 🔴 red (>3 behind) | 5 months ago | 1 (or 0) |

### 1. Sub-ID bulk entry (deduped)

1. As a branch admin → **Admin → Users** → add a Sub-ID with range `1–500`.
2. Sign in as that sub-ID → ✅ the dashboard now shows the **loan-book entry
   form** plus a live **Entered / Remaining** progress strip (not just the range).
3. Add a customer: account no `3473`, name, village/post/taluka/district,
   mobile(s), model no, purchase date, loan amount, installment, tenure.
   ✅ Green "Added account 3473 — …" banner; the **Entered** count goes up by one.
4. Negative — duplicate: add another customer with account no `3473` again →
   ✅ red banner "A customer with account number 3473 already exists"; nothing
   saved.
5. Negative — range cap: once the entered count reaches the range size, the next
   save → ✅ "sub-id range exhausted".

### 2. Account number is unique per branch (not globally)

1. As the **Pune** sub-ID/admin, add account `3473`.
2. As the **Mumbai** admin, add a customer with account `3473` → ✅ allowed. Each
   branch keeps its own loan book.

### 3. Installment registry (employee)

1. As an employee → **Customers** → search by name / mobile / **account number**
   → open the customer → **EMI History** tab.
2. ✅ The tab shows a status badge, "Paid X of Y", an **Add installment** form,
   the **payments grid** (Sr / Date / Month / Installment / Penalty / Total /
   Receipt / Sign) and a **Follow-ups** log.
3. Record an installment: month #, date, amount (defaults to the EMI), penalty,
   receipt no, mode, signature. ✅ Green banner; the row appears with the correct
   **Total = installment + penalty**; "Paid X of Y" increments.
4. Add a follow-up note ("promised to pay on 20th") → ✅ it appears with a
   timestamp. Add another next time you chase them — they stack newest-first.

### 4. Reminder counts in the header

1. Create a few customers using the **Simulating time** table above.
2. ✅ The header shows 4 pills — 🟢 🟡 🟠 🔴 — with this branch's counts. On a
   phone they appear in the row under the header.
3. Click a pill → ✅ the Customers list is filtered to that colour band; each row
   also shows its own colour badge + `A/c` number. **Clear** removes the filter.
4. Log enough installments on a red customer to catch them up → reload → ✅ they
   move to green and the counts shift.

### 5. Branch scoping + owner view

1. Counts and the registry only ever reflect the signed-in user's branch (a
   second branch's customers never appear).
2. As the **owner** → `/dashboard/owner` → ✅ each branch card shows that branch's
   🟢 🟡 🟠 🔴 buckets. The owner has no installment/registry controls
   (read-only at the DB layer).

### 6. Automated coverage

Run `npm test` (Vitest) and `npx supabase test db` (pgTAP) — see **Automated
tests** above. Together they pin the bucket math, dedup, range cap, and the
owner-reject rule without any manual data entry.

---

## Phase 4.5 — Receipts, Edit, Back Buttons, First-EMI Date, ₹500 Penalty

Branch: `phase-4.5-client-feedback`. Two additive migrations.

### 0. Apply the migrations

```bash
npx supabase db push          # remote
# or, locally (needs Docker):
npx supabase db reset         # replays every migration from scratch
```

`20260802120000_penalty_banks_first_emi.sql` renames the banks, flips the `loans`
penalty defaults to `monthly_fixed` / 50000 paise (backfilling loans still on the
old defaults), adds `loans.first_emi_date` (backfilled to `started_at + 1 month`)
and `payments.invoice_no` (backfilled from a new sequence, unique index).
`20260802120100_receipt_edit_rpcs.sql` adds `installments_due()`,
`payment_receipt()` and `update_customer()`, and re-anchors `create_customer`,
`log_payment`, `customer_status_counts` and `owner_branch_stats`.

> **Sanity check that nothing moved:** the bucket counts before and after the push
> must be identical. `installments_due` with the default first-EMI date
> (`purchase + 1 month`) is arithmetically the same as the old
> `least(months_elapsed(purchase, today), tenure)`.

```sql
select * from public.customer_status_counts();
select name from public.banks order by name;          -- Bhagyalaxmi, Dhanshree
select penalty_type, penalty_rate_paise from public.loans limit 5;
```

### 1. First EMI date auto-fills

Customers → Add customer. Type a purchase date → **First EMI date** fills with
purchase + 1 month and shows *"Filled automatically"*. Change the purchase date →
it follows. Type your own first-EMI date → it stops following and shows *"Set by
hand"* with a **Reset to automatic** link. Save; the Loan tab shows both dates.

Verify the fallback path too — the field is nullable by design:

```sql
-- A loan with no first_emi_date must behave as purchase + 1 month.
update public.loans set first_emi_date = null where id = '<loan-id>';
select public.installments_due(null, purchase_date, 12) from public.customers where id = '<customer-id>';
```

### 2. Penalty suggestion (not auto-charge)

Open a customer 2+ months behind → **EMI / Payments**. The Penalty box is
pre-filled with `₹500 × months behind` and explains itself underneath. Overwrite
it, or set `0` to waive — nothing is charged without the employee saving it.
A `per_day` loan gets no suggestion (that needs the deferred accrual engine).

### 3. Receipt printing

Record an installment → the green banner carries **Print receipt**. Also reachable
per row (the **Invoice** column) and via **Invoice print** (→ `receipt/latest`).

- `Ctrl+P`: two A5 halves on one A4, no header / nav / progress bar.
- Re-open an **older** payment's receipt: its `Paid X of Y · PENDING Z` must
  reflect that payment's point in time, not today's total. This is
  `payment_receipt()` counting `(paid_at, id) <= (this.paid_at, this.id)`.
- `invoice_no` is unique and sequential; `receipt_no` stays free text.

### 4. Customer edit

Customer card → **Edit** (visible to admin + employee only). Employees have **no
RLS UPDATE policy** — a working save proves the security-definer
`update_customer()` path, not a loosened policy. Confirm the guards:

| Attempt | Expected |
|---|---|
| Change village / EMI and save | Saved; payments untouched; `audit_log` has an UPDATE row |
| Reuse another customer's account number | `A customer with account number … already exists` |
| Save unchanged (same account number) | Succeeds — the dedup excludes the row being edited |
| Tenure below installments already paid | `Tenure cannot be less than the N installments already recorded` |
| Another branch's customer id | `Customer not found in your branch` |
| As owner or sub_id | `Your role cannot edit customers`; no Edit button rendered |

### 5. Back button

`components/back-button.tsx` is mounted once in the dashboard layout and derives
the parent from the pathname. Check `/dashboard` and `/dashboard/owner` render
none, `…/customers/<id>/receipt/<pid>` goes back to the customer card (not to a
bare `/receipt`), and the sub-ID shell is covered too.

### 6. Automated coverage

`npm test` → 34 Vitest cases. `npx supabase test db` → 38 pgTAP assertions,
now also covering `installments_due`, the bank rename, the ₹500 defaults,
first-EMI derivation, `invoice_no`, historical `payment_receipt` counts and every
`update_customer` guard above.

> pgTAP runs against the **local** stack. If `installments_due` reports as
> missing, the local DB predates the migrations — run `npx supabase db reset`
> first (`supabase start` alone does not replay new migration files).

---

## Phase 4.9 — Partial Payments, the Penalty Ledger, Full Receipt Breakdown

Client feedback round 3, slice A — recordings 1, 2, 3, 10, 11, 12, 13, 14, 15.

### 0. Apply the migrations

```bash
npx supabase db reset          # local: replays all 20 migrations
npx supabase db push           # remote
```

Four new files, in order: `20260812120000_payment_partials.sql`,
`…120100_penalty_ledger.sql`, `…120200_loan_balances_view.sql`,
`…120300_payment_rpcs_v3.sql`.

### Simulating time (read this first)

Same trick as Phase 4: back-date `purchase_date`. A customer bought 4 months ago
has 4 instalments due and — after the 2-day grace on each — **3** accrued
penalties, not 4. The newest due month is still inside its grace window. Getting
this wrong is the most common source of "the penalty total looks off by ₹500".

### 1. Money is counted, not rows

Add a customer with a purchase date 4 months back, EMI ₹5,000, tenure 12. On the
**EMI / Payments** tab:

| Record | Expect |
|---|---|
| Amount received `3000` | split shows ₹1,500 penalty + ₹1,500 instalment; preview reads `0 of 12`, `Balance on EMI #1 ₹3,500` |
| Then `3500` | now `1 of 12` — **two payment rows, one settled instalment** |

This is the whole point of the round. Verify in SQL that nothing counts rows:

```sql
select installments_settled, emi_collected_paise, pending_month_no,
       pending_month_balance_paise, penalty_balance_paise, loan_balance_paise
  from public.loan_balances lb
  join public.customers c on c.id = lb.customer_id
 where c.account_no = '5001';
```

### 2. The split is editable, and its order lives in one place

Typing in **Towards penalty** or **Towards instalment** rebalances the other so
the two always sum to what was received; "Reset to automatic" restores it. The
order (penalty first) is `splitReceipt()` in `lib/loan-status.ts` — flipping to
EMI-first is a one-line change there and nowhere else.

### 3. Penalty-only receipt

The **Pay penalty only** panel appears only when `penalty_balance_paise > 0`.
Recording one posts `installment_paise = 0`, which the old `log_payment` refused.

| Attempt | Expected |
|---|---|
| penalty `500`, instalment `0` | recorded; `payment.kind = 'penalty'`, slip titled "Penalty Receipt" |
| both `0` | rejected — *"Enter an installment amount, a penalty amount, or both"* |
| the `payments_amount_or_penalty` CHECK | backstops any write that bypasses the RPC |

### 4. The accrual engine

`accrue_penalties(loan)` is idempotent and judges each month against the money
received **by that month's own deadline**, never against today's balance — so a
customer who catches up later keeps the charges they earned.

```sql
select public.accrue_penalties('<loan-id>');   -- returns rows created
select public.accrue_penalties('<loan-id>');   -- 0 on the second call
```

It runs in three places: inside `log_payment` before the insert, from the
customer card's read path (errors ignored — a penalty hiccup must not 500 the
card), and via `accrue_penalties_all()`, which is the pg_cron entry point.

> **Not yet scheduled.** pg_cron has to be enabled on the project first, then:
> `select cron.schedule('penalty-sweep','15 19 * * *', $$select public.accrue_penalties_all()$$);`

> **Known wrinkle:** a charge is never removed. Entering a *back-dated* payment
> after accrual has already charged that month leaves the charge standing; an
> admin waives it. Forward entry is unaffected.

### 5. Admin-only penalty and receipt edits (recordings 10, 13)

| Role | Penalty ledger edit / waive | `amend_payment` | `void_payment` |
|---|---|---|---|
| admin | ✅ | ✅ | ✅ |
| employee | ❌ *"Only an admin…"* | ❌ | ❌ |
| owner | ❌ (read-only at the DB layer) | ❌ | ❌ |

The client said "Owner and Admin"; this ships as **admin-only** because the owner
has no write policy on any operational table and `current_branch_id()` is NULL for
it. Flipping that later means changing one role test per RPC and deriving the
branch from the target row. Flagged for the client in the round-3 test sheet.

### 6. Receipts stay historical

Print the first receipt, record more payments, print it again — every figure must
be unchanged. Ordering is `(paid_at, invoice_no, id)`: `paid_at` comes from a date
input, so **every receipt taken on the same day shares one midnight timestamp**,
and the old `(paid_at, id)` tie-break compared random UUIDs. That made "total paid
today" non-deterministic. If you touch this ordering, change it in
`payment_receipt()` **and** in `accrue_penalties()`'s running-total window.

Check on the slip: first EMI date, EMI paid today, `Balance on EMI #n`, penalty
paid, penalty balance, **Total paid today**, **Total outstanding**, remark — and
still two A5 copies on one A4 with no app chrome.

### 7. Automated coverage

`npm test` → 58 Vitest cases. `npx supabase test db` → **105** pgTAP assertions
(74 after this phase; slice B below adds the rest).
All 38 pre-existing assertions are unchanged and still pass — that is the
regression proof that whole-EMI payers did not move reminder bucket, since
`installments_settled == count(payments)` exactly when every payment is one EMI.

New pgTAP groups: `installments_settled` / `pending_month_no` /
`pending_month_shortfall`, accrual idempotency, a charge surviving catch-up,
partial-payment allocation, the penalty-only receipt, `payment_receipt`'s new
keys, admin-vs-employee-vs-owner gating on `set_penalty_charge` / `amend_payment`,
and `void_payment` leaving a soft-deleted row out of the balances.

### No Node on the machine? Verify through Docker

Both suites normally need Node. If it is missing (or broken), all three checks can
still be run against containers — this is how this phase was verified.

**pgTAP.** Start the same Postgres image the CLI uses, wait for init to finish
(the log prints "ready to accept connections" **twice**), stub what the Supabase
platform normally provides, then pipe each migration and the test file through:

```bash
docker run -d --name pgcheck -e POSTGRES_PASSWORD=postgres \
  public.ecr.aws/supabase/postgres:17.6.1.127
# stubs: pgcrypto, pg_trgm, pgtap; schema auth + auth.users;
#        auth.uid() reading request.jwt.claims; roles anon/authenticated/service_role
for f in supabase/migrations/*.sql; do
  docker exec -i -u postgres pgcheck psql -U supabase_admin -d postgres \
    -v ON_ERROR_STOP=1 -q < "$f" || echo "FAILED $f"
done
docker exec -i -u postgres pgcheck psql -U supabase_admin -d postgres -q \
  < supabase/tests/ledger_test.sql
```

> The stub `auth.uid()` **must** read `request.jwt.claims` — a version that
> returns NULL makes every RPC test fail with "Not authorized" and looks like a
> code bug.

**tsc and Vitest.** `tsc` is pure JS and runs straight off the mounted
`node_modules`. Vitest additionally needs Linux builds of rollup and esbuild,
which a Windows install does not have — side-load them **at the exact versions in
`node_modules`** (a mismatch fails with "Host version does not match binary
version") rather than writing into the project:

```bash
docker run --rm -v "//c/path/to/banking-app:/app" -w /app node:22-alpine \
  node node_modules/typescript/bin/tsc --noEmit

docker run --rm -v "//c/path/to/banking-app:/app" -w /app node:22-alpine sh -c "
  npm i --prefix /tmp/fix @rollup/rollup-linux-x64-musl@<ver> @esbuild/linux-x64@<ver>
  export NODE_PATH=/tmp/fix/node_modules
  export ESBUILD_BINARY_PATH=/tmp/fix/node_modules/@esbuild/linux-x64/bin/esbuild
  node node_modules/vitest/vitest.mjs run"
```

ESLint does **not** survive this route — it dies with `EIO: i/o error` reading
through a OneDrive bind mount. Run `npm run lint` on a machine with Node.

---

## Phase 4.95 — Foreclosure & Seizing

Client feedback round 3, slice B — recordings 4 to 9.

### 0. Apply the migrations

`20260812130000_closure_columns.sql`, `20260812130100_closure_rpcs.sql`.

Both `foreclosures` and `seizures` have existed since Phase 2 with branch columns,
triggers and RLS, so these files only add the columns the screen needs. **No new
enum value:** Exit Seizing is `status = 'resolved'` plus `exited_at`, which avoids
the own-file `ALTER TYPE … ADD VALUE` dance for what would be a synonym.

### 1. Search by "loan number"

`/dashboard/foreclosure` → the box is labelled **Loan / account number** and runs
`search_customers`, the same RPC the customers page uses. There is no `loan_no`
column and inventing one would hand the branch an identifier that is not in their
books; `customers.account_no` is the number they actually write down.

Name, mobile, RC and engine number all still match.

### 2. The six-month rule (recordings 5 and 6)

Back-date two customers: one **7 months** old, one **3 months** old.

| Loan age | Add Foreclosure | Panel |
|---|---|---|
| 7 months | enabled (for an admin) | the full quote |
| 3 months | **disabled**, tooltip names the eligible-from date | amber "opens six months after the loan start date" banner |

Then prove the button is only a courtesy — call the RPC directly for the young
loan and watch it refuse:

```sql
select public.record_foreclosure(jsonb_build_object('loan_id', '<young-loan>'));
-- ERROR: Foreclosure is only allowed after six months — eligible from DD-MM-YYYY
```

### 3. The quote

`loans` has no interest column, so interest is derived:
`total_interest = emi × tenure − principal`, split straight-line across the
tenure. Two figures stay with the operator: **interest waived** (defaults to the
whole remaining interest) and **bank charge** (defaults to ₹1,000, PRD §3.7).

```
final_payable = greatest(emi_outstanding − interest_waived, 0)
                + bank_charge + penalty_balance
```

> PRD §3.7's worked example ("₹6,000 − ₹1,000 = ₹5,000") actually describes the
> customer's **saving**, not what they hand over. The screen shows
> `customer_saving_paise` and `final_payable_paise` as separate labelled rows so
> the two can never be confused again. Worth confirming with the client.

Recording the quote snapshots every line, so a foreclosure printed today is still
explainable months later.

### 4. Seizure lifecycle (recordings 7, 8, 9)

| Step | Who | Result |
|---|---|---|
| Add Seizing | employee | `pending` |
| Add Seizing + "Approve now" | admin | `active` |
| Approve seizing (amount editable) | admin only | `pending` → `active` |
| Exit Seizing | **admin only** | `resolved` + `exited_at` |

A second open seizure on the same customer is refused by
`seizures_open_uq` *and* by `record_seizure`.

### 5. Exit Seizing guards (recording 8)

`exit_seizure` accrues penalties first, then refuses unless **all three** are
clear, naming the figure that blocks it:

| Blocker | Message |
|---|---|
| EMI arrears | *EMI arrears of Rs 12,500.00 are still outstanding* |
| Penalty balance | *A penalty of Rs 1,500.00 is still outstanding* |
| Unpaid foreclosure quote | *The recorded foreclosure amount has not been paid* |

> It checks **arrears**, not the whole remaining loan. A customer who has caught
> up mid-tenure gets the vehicle back; demanding the entire balance would mean
> nobody is ever released, which is neither what the client described nor what
> happens in practice.

### 6. Roles

Same call as slice A: the client said "Owner and Admin", this ships **admin-only**
because the owner is read-only at the DB layer. Check as an employee that Add
Foreclosure, Approve and Exit Seizing are all disabled with a reason, and that the
RPCs refuse even if the button is bypassed.

### 7. Automated coverage

pgTAP fixtures `FORE-1` (7 months, in arrears), `FORE-2` (3 months, not eligible)
and `FORE-3` (7 months, every instalment paid **on its own due date**, so nothing
accrued — the Exit Seizing happy path). 31 assertions covering eligibility both
ways, the server-side re-check, the quote arithmetic, duplicate-quote and
duplicate-seizure rejection, every role gate, all three exit guards, and
`settle_foreclosure` closing the loan as `foreclosed`.

---

## Phase 5 — Bank Recovery + Daily Summary + Pending List (planned)

> To be filled in once Phase 5 ships.

---

## Phase 6 — OTP + Sub-IDs + Audit + Soft Delete + Docs/Keys (planned)

> To be filled in once Phase 6 ships.

---

## Phase 7 — Realtime + Cron + PWA + UAT (planned)

> Final UAT against PRD §9 (AC-01 to AC-12). Each acceptance criterion gets pass/fail here.

---

## Reset / Reseed (only if needed during testing)

To wipe all data and re-run migrations against the remote database:

```bash
# DESTRUCTIVE — only run on a non-production project
npx supabase db reset --linked
```

For dev-only schema tweaks, write a new migration file (`YYYYMMDDHHMMSS_name.sql`)
and run `npx supabase db push`. Never edit a migration that has already been pushed.
