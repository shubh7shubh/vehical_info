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

### 1. Create an admin user

1. Open the **Auth → Users** page in Supabase Dashboard
2. Click **Add user → Create new user**
3. Enter email + password
4. Tick **Auto Confirm User** (skips email verification)
5. Click **Create user**

> The `handle_new_auth_user` trigger automatically creates a matching row in `public.users` with default role `employee`.

### 2. Promote that user to admin

In the **SQL Editor**, run:

```sql
update public.users set role = 'admin'
where email = 'YOUR_ADMIN_EMAIL@example.com';

select id, email, role from public.users;
```

The user should now appear with `role = admin`.

### 3. Test the admin flow

1. Open http://localhost:3000 → automatically redirected to `/login`
2. Sign in with the admin email + password
3. ✅ Land on `/dashboard`
4. ✅ Email and `admin` role badge appear top-right
5. ✅ Nav contains `Dashboard / Customers / Pending / Bank Recovery / Daily Summary / Admin`
6. Click **Admin** → `/dashboard/admin` opens with the Admin Console
7. Click **Sign out** → back to `/login`

### 4. Test the employee flow (proves role gating works)

1. Add a second user in the Auth Dashboard, e.g. `employee@test.com` (auto-confirm on)
2. **Do not promote** — leave default role `employee`
3. Open an **incognito window** and sign in as that user
4. ✅ No **Admin** link in nav
5. ✅ Role badge shows `employee`
6. Manually visit http://localhost:3000/dashboard/admin
7. ✅ You should be redirected back to `/dashboard` (proxy.ts blocks non-admins)

### 5. Test the sub-ID flow

1. Add a third user `subid1@test.com` (auto-confirm on)
2. In SQL Editor:
   ```sql
   update public.users
   set role = 'sub_id', sub_id_range_start = 1, sub_id_range_end = 500
   where email = 'subid1@test.com';
   ```
3. Sign in as that user
4. ✅ Stripped-down "Bulk Data Entry" screen appears (no main nav, no tiles)
5. ✅ Assigned range `1 – 500` is shown

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

> Goal: prove the admin can run the full user lifecycle from inside the app, with no Supabase Dashboard access.

### 1. Open the Users page
1. Sign in as admin → top nav → click **Admin** → click the **Users** tile (or visit `/dashboard/admin/users`)
2. ✅ Your own row appears, marked `(you)`, with role `admin` and status `Active`
3. Visiting the same page as an employee should redirect to `/dashboard` (proxy gate)

### 2. Create a user via the form
1. Fill: email `employee2@test.com`, password `Test1234!`, role `Employee`
2. Click **Add user**
3. ✅ Green "Created employee2@test.com" banner appears, the row shows up below

### 3. Sub-ID role + range
1. In the row for `employee2@test.com`, change role select to `Sub-ID`, set start `1`, end `500`, click **Save**
2. ✅ Status row updates, Range column reads `1 – 500`
3. Sign in as `employee2@test.com` in incognito → ✅ stripped-down "Bulk Data Entry" screen with `Range: 1 – 500`

### 4. Disable / Enable
1. Back as admin → click **Disable** on `employee2@test.com`
2. ✅ Status badge flips to `Disabled`
3. In incognito, employee2 attempts sign-in → ✅ redirected back to `/login` (`requireUser` rejects disabled accounts)
4. Click **Enable** → status goes back to `Active`

### 5. Guardrails
1. Try to change your own role from `admin` to `employee` → ✅ red banner: "You cannot demote yourself"
2. Try to **Disable** yourself → ✅ button is disabled in the UI
3. If you're the only admin and try to demote any admin → ✅ red banner: "Cannot demote the only active admin"

### 6. Delete
1. Click **Delete** on `employee2@test.com` → row disappears
2. Supabase Dashboard → Auth → Users → ✅ that user is also gone (auth + public.users cascaded)

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
