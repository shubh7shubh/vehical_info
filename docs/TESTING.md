# Testing Guide
## Vehicle Finance Loan Management System

This document describes how to verify each phase end-to-end. Run through it after every deploy.

---

## Prerequisites

- `.env.local` populated with real Supabase keys (see `.env.local.example`)
- All migrations applied (run `npx supabase db push` after `supabase link`)
- Dev server running: `npm run dev` → http://localhost:3000

Useful Supabase Dashboard URLs (replace project ref if it changes):
- Users: https://supabase.com/dashboard/project/eeqyslialzgpatutsnwh/auth/users
- SQL Editor: https://supabase.com/dashboard/project/eeqyslialzgpatutsnwh/sql/new
- Table Editor: https://supabase.com/dashboard/project/eeqyslialzgpatutsnwh/editor

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

## Phase 3 — Customer Management & Smart Search (planned)

> To be filled in once Phase 3 ships.

Expected checks:
- Onboard a customer with full details → row appears in `public.customers`
- Onboarding form rejects duplicate RC number / engine number
- Smart search returns results by partial name, RC, engine no, mobile, Aadhaar
- Customer card shows Customer / Guarantor / Vehicle / Loan summary tabs
- "Record incomplete" badge visible when engine number missing

---

## Phase 4 — Payments + Auto Penalty + Pending List (planned)

> To be filled in once Phase 4 ships.

---

## Phase 5 — Bank Recovery + Daily Summary + Foreclosure + Seizure (planned)

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
