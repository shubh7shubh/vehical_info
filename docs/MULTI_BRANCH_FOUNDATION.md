# Phase 2.7 — Multi-Branch Foundation

## Context

The client reviewed the working app and asked for a structural change. Their
business is **one company with multiple physical branches** (Pune, Mumbai,
Nagpur, …) — *not* a multi-company SaaS. Today the app is single-tenant: a flat
`users` table (`admin | employee | sub_id`) and RLS where any admin/employee
sees **all** customers, loans and payments. The client wants each branch's data
**separated for visibility and security**, each branch run by its own admin +
staff, and a new single top-level **owner** account that oversees every branch.

This is foundational: every Phase 3–7 table (customers, loans, payments,
recovery, summary, …) must be branch-scoped from creation. So it lands as a new
phase **between Phase 2.5 and Phase 3**, mirroring how Phase 2.5 was lifted out
of Phase 6.

### Decisions locked with the user
1. **Model** — one implicit company; a new `branches` table is the tenant unit.
   No `companies` table.
2. **owner role** — single global super-admin, `branch_id = NULL`, sees all
   branches. The **existing bootstrap admin is promoted to owner**.
3. **Admins per branch** — created with one admin, but **more admins allowed
   later**; the last-admin guardrail becomes *per branch*.
4. **banks** — stays **global / company-wide** (shared Bank A / Bank B list,
   **no** `branch_id`). Recovery lists still come out per-branch because they
   are computed from each branch's own customers.
5. **owner capabilities** — aggregate per-branch stats + create/manage branches
   & their admins/users + **read-only** drill-down into any branch's data.

### Outcome
An `owner` who logs into a cross-branch dashboard; branches each isolated so a
branch admin/employee sees only their branch; data leakage blocked at the DB
(RLS), not just the UI.

---

## 1. Database — 6 new migration files in `supabase/migrations/`

`npx supabase db push` runs each file in its own transaction. The enum gotcha
(`ALTER TYPE ... ADD VALUE` cannot be *used* in the same transaction) forces the
enum change into its own file. Push order is filename order:

| File | Purpose |
|---|---|
| `20260518090000_add_owner_role.sql` | **only** `alter type app_role add value if not exists 'owner';` |
| `20260518090100_branches_table.sql` | `branches` table + RLS-enabled + `set_updated_at`/`audit` triggers |
| `20260518090200_branch_id_columns.sql` | add **nullable** `branch_id` + index to `users` + 9 operational tables + `audit_log` |
| `20260518090300_branch_backfill.sql` | seed default branch, backfill, promote owner, set NOT NULL + CHECK |
| `20260518090400_rls_branch_scoped.sql` | new RLS helpers + full branch-scoped policy rewrite |
| `20260518090500_triggers_branch.sql` | `set_branch_id()` + updated audit / new-user / sub-id triggers |

### File B — `branches`
```sql
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,            -- short slug, e.g. 'PUN'
  city text, address text, phone text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz       -- soft-delete only
);
create index branches_deleted_idx on public.branches(deleted_at);
alter table public.branches enable row level security;
-- + branches_set_updated_at, branches_audit triggers
```

### File C — nullable `branch_id` everywhere
`branch_id uuid references public.branches(id)` on: `users`, `customers`,
`vehicles`, `guarantors`, `loans`, `payments`, `penalties`, `seizures`,
`foreclosures`, `documents_keys`, `audit_log` — plus a `*_branch_idx` index on
each. **`banks` gets none** (global). Added nullable; NOT NULL applied in File D.

### File D — seed + backfill + constraints (references `'owner'`, safe — File A committed earlier)
- Insert default branch `('Main Branch','MAIN','Head Office')`.
- Backfill every operational row's `branch_id` to the MAIN branch id.
- Promote the **oldest** admin to owner:
  `set role='owner', branch_id=null, sub_id_range_start/end=null`.
- `alter column branch_id set not null` on the 9 operational tables.
- `users.branch_id` stays **nullable** (owner = NULL); guard with:
  ```sql
  alter table public.users add constraint users_branch_required_unless_owner
    check (role = 'owner' or branch_id is not null);
  ```
- `audit_log.branch_id` stays permanently nullable (owner/branch-creation events
  have no branch).

### File E — RLS helpers + policy rewrite
New `security definer` helpers (alongside existing `current_role()`, `is_admin()`…):
```sql
create function public.is_owner() returns boolean ...
  select coalesce(public.current_role() = 'owner', false);
create function public.current_branch_id() returns uuid ...
  select branch_id from public.users where id = auth.uid() and disabled_at is null;
```
`is_admin()` stays false for owner — owner is correctly kept off admin pages.

Rewrite **every operational table** policy: keep its existing role logic and add
`and branch_id = public.current_branch_id()`, plus one `*_owner_read`
`for select using (public.is_owner())` policy. Customers template:
```sql
create policy customers_owner_read on public.customers
  for select using (public.is_owner());
create policy customers_branch_emp_read on public.customers for select using (
  public.is_employee_or_admin() and branch_id = public.current_branch_id());
create policy customers_branch_subid_read_own on public.customers for select using (
  public.current_role()='sub_id' and created_by=auth.uid()
  and branch_id = public.current_branch_id());
-- inserts: same + branch predicate;  update/delete: is_admin() + branch predicate
-- in BOTH using and with check
```
Apply the identical transform to `vehicles, guarantors, loans, payments,
penalties, seizures, foreclosures, documents_keys`.

Other tables:
- `users` — self-read OR owner OR (admin AND same branch); `users_owner_write`
  (`for all`, owner); `users_admin_write` (`for all`, admin + same branch, and
  `with check (... role <> 'owner')` so an admin can't mint an owner).
- `branches` — `branches_owner_all` (owner) + `branches_member_read`
  (active user, `id = current_branch_id()`).
- `banks` — unchanged read; write gains `or public.is_owner()`. **No branch predicate.**
- `audit_log` — `audit_owner_read` (owner) + `audit_admin_read` (admin + same branch).

Owner gets **select-only** on operational tables (no insert/update/delete
policy) — read-only drill-down enforced at the DB. `current_branch_id()` is NULL
for owner, so every `branch_id = current_branch_id()` predicate is false for
owner; owner matches only `is_owner()` policies. Policies are OR-combined
(permissive), so this is leak-free.

### File F — triggers
- **`set_branch_id()`** — `before insert` on the 9 operational tables. Respects
  an explicit `branch_id`; else stamps it: `customers` from
  `current_branch_id()`; child tables from their parent
  (`vehicles/guarantors/loans/seizures/documents_keys` → `customers`,
  `payments/penalties/foreclosures` → `loans`). Raises if it can't resolve one.
- **`handle_new_auth_user()`** — now inserts `public.users` with
  `branch_id = MAIN branch` (not NULL) so the new `users` CHECK is **never**
  transiently violated; the create-user/create-branch-admin actions then UPDATE
  `branch_id` to the real branch.
- **`audit_log_trigger()`** — also stamps `branch_id` read from the affected
  row's jsonb (`nullif(...,'')::uuid`; `banks` rows have no key → NULL, correct).
- **`enforce_sub_id_range()`** — count own customers `and branch_id = u.branch_id`.

**Trigger fire order on `customers`:** before-triggers fire alphabetically.
New `customers_set_branch_id` sorts before existing `customers_sub_id_range`, so
`branch_id` is stamped before the range check reads it — no rename needed.

---

## 2. Application layer

### `lib/auth/current-user.ts`
- `AppRole` → `"owner" | "admin" | "employee" | "sub_id"`.
- Add `branchId: string | null` + `branchName: string | null` to `CurrentUser`;
  `getCurrentUser` selects `branch_id` and joins `branches(name)`.
- Add `requireOwner()` (redirect non-owner to `/dashboard`). `requireAdmin()`
  stays as-is (owner is not admin → bounced off admin pages, correct).

### `proxy.ts`
- Add `OWNER_PREFIXES = ["/dashboard/owner"]`; lift the `profile` (role)
  fetch so it covers gating **and** landing.
- Gate `/dashboard/owner` to `role === "owner"`.
- Post-login redirect when already authed: owner → `/dashboard/owner`, else
  `/dashboard`.

### `app/(auth)/login/actions.ts`
- After successful sign-in, when `next` is the default `/dashboard`, send owner
  to `/dashboard/owner` (honors explicit deep-link `next`).

### `app/dashboard/layout.tsx` + `page.tsx`
- `layout.tsx`: add an **owner** branch (above the `sub_id` branch) with owner
  nav `[Dashboard → /dashboard/owner, Branches → /dashboard/owner/branches]` and
  no operational links. Non-owner header gains a branch-name chip
  (`user.branchName`).
- `page.tsx`: `if (user.role === "owner") redirect("/dashboard/owner")` guard.

### New `app/dashboard/owner/*`
```
owner/page.tsx                      -- per-branch aggregate stats
owner/branches/page.tsx             -- branches list + "Create branch" form
owner/branches/actions.ts           -- createBranch / createBranchAdmin / archiveBranch
owner/branches/[branchId]/page.tsx  -- read-only drill-down
```
- `owner/page.tsx` — `requireOwner()`; stats via a `security definer` RPC
  `owner_branch_stats()` (business logic in Postgres per CLAUDE.md); empty-table
  safe (Phase 3+ tables may be empty).
- `createBranchAction` — zod-validate; service-role client; insert `branches`;
  create auth user; UPDATE `public.users` set `role='admin'` **and**
  `branch_id=<new branch>` in one statement.
- `createBranchAdminAction` — add more admins to an existing branch.
- `archiveBranchAction` — soft-delete (`deleted_at`), never hard delete.
- `[branchId]/page.tsx` — owner read-only drill-down (stats + recent audit now;
  grows as Phases 3–7 ship).

### `app/dashboard/admin/users/page.tsx` + `actions.ts`
- Scope the user list to `me.branchId` (`.eq("branch_id", me.branchId)`).
- `createUserAction` patch UPDATE also sets `branch_id: me.branchId`.
- Role `<select>` and zod role enums stay `admin | employee | sub_id` — `owner`
  is never offered in the admin panel.
- **Per-branch** last-admin guardrail: `activeAdminCount(branchId)` and
  `isLastActiveAdmin` filter `.eq("branch_id", …)`; "cannot demote/disable/delete
  the only active admin" becomes per-branch automatically.
- Add `owner` to `roleLabel`/`roleBadge` maps so the file type-checks.

### `scripts/create-admin.mjs`
- Repurpose to provision the **owner**: UPDATE `public.users` set `role='owner'`,
  `branch_id=null`; refuse if an owner already exists.

`components/mobile-nav.tsx`, `components/submit-button.tsx` — no change
(item-driven).

---

## 3. Documentation updates (part of this phase's deliverables)

- **`docs/PROJECT_REPORT.md`** — insert a new `## Phase 2.7 — Multi-Branch
  Foundation` section after Phase 2.5 (status, demo, deliverables, guardrails,
  demoable proof) in the same style as Phase 2.5; note that Phases 3–7 are now
  branch-scoped.
- **`docs/TESTING.md`** — add a `## Phase 2.7` section: bootstrap owner, create
  a branch + its admin, sign in as that admin and confirm they see only their
  branch, verify a second branch is invisible, owner drill-down is read-only,
  per-branch last-admin guardrail, audit-log spot check.
- **`CLAUDE.md`** — add `owner` to the Roles list; add a `## Branches` section
  (company implicit; owner global `branch_id=NULL`; `banks` global; every
  operational table carries `branch_id`); update the Build Phase Status
  checklist with Phase 2.7. Add a **mandatory checklist for every new Phase 3+
  table**: `branch_id uuid not null references branches(id)`, a
  `*_set_branch_id` before-insert trigger, a branch index, branch-scoped RLS +
  an `*_owner_read` select policy.
- **`docs/CLIENT_TESTING.md`** — add a client-facing branch test if that file
  follows the per-phase pattern.

---

## 4. Sequencing & risks

- **Push order A→F is mandatory.** A (enum) must commit before D/E/F use
  `'owner'`. D must run before E — otherwise branch-scoped policies hide all
  existing rows mid-migration. Never wrap files in an outer transaction.
- **`users` transient-NULL trap (resolved):** `handle_new_auth_user` stamps the
  MAIN branch so the `users` CHECK is never violated between INSERT and the
  panel's branch UPDATE.
- **Owner write leak:** `is_owner()` goes only on `for select` policies of
  operational tables — never insert/update/delete/`for all`. Owner's only
  writable surfaces: `branches` and `users`.
- **Admin minting owner:** blocked twice — UI omits `owner`, and
  `users_admin_write with check` has `role <> 'owner'`.
- **Service-role bypass:** server actions with the admin client bypass RLS;
  owner pages must never mutate operational data, and `branch_id` must always be
  server-derived, never taken from user input.

---

## 5. Verification

1. `npx supabase db push` — all 6 files apply clean, in order.
2. SQL Editor:
   - `select role, count(*) from users group by role` → exactly one `owner`.
   - `select count(*) from customers where branch_id is null` → `0` (and same
     for the other 8 operational tables).
3. Run `scripts/create-admin.mjs` only if no owner exists; confirm it refuses a
   second owner.
4. Log in as owner → land on `/dashboard/owner`; create "Pune Branch" with an
   admin; create "Mumbai Branch" with an admin.
5. Incognito as the Pune admin → sees only Pune; the user panel lists only Pune
   staff; visiting `/dashboard/owner` redirects to `/dashboard`.
6. As Pune admin add a customer; as Mumbai admin confirm that customer is
   **not** visible. In SQL Editor with the Mumbai admin's session, a direct
   `select` of the Pune customer returns zero rows (RLS proof).
7. Owner drill-down into Pune shows the customer; owner attempting any write to
   branch data fails (no RLS write policy).
8. Per-branch last-admin: with one admin in a branch, demoting/disabling/
   deleting them is rejected; add a second branch admin → the action succeeds.
9. `select table_name, branch_id from audit_log order by at desc limit 20` →
   branch rows carry `branch_id`; branch-creation rows are NULL.
10. Re-run the existing Phase 2 / 2.5 tests in `docs/TESTING.md` scoped to one
    branch — no regressions.
