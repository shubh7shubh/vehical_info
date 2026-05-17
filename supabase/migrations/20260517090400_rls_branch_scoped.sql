-- Phase 2.7 — Multi-Branch Foundation (5/6): branch-scoped RLS.
--
-- Every operational policy keeps its original role logic and gains
--   `and branch_id = public.current_branch_id()`
-- so an admin/employee/sub_id only ever touches their own branch's rows.
-- The owner is added as a SELECT-ONLY exception on operational tables
-- (`*_owner_read`), which enforces read-only drill-down at the database layer.
--
-- current_branch_id() returns NULL for the owner, so every
-- `branch_id = current_branch_id()` predicate is false for the owner — the
-- owner matches only the is_owner() policies. Policies are permissive (OR-ed),
-- so this is leak-free. This file must run AFTER the backfill (file 4): if it
-- ran first, branch-scoped policies would hide all pre-existing rows.

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'owner', false);
$$;

create or replace function public.current_branch_id() returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from public.users
  where id = auth.uid() and disabled_at is null;
$$;

-- ----------------------------------------------------------------------------
-- USERS
-- ----------------------------------------------------------------------------
drop policy users_self_read  on public.users;
drop policy users_admin_write on public.users;

create policy users_self_read on public.users
  for select using (
    auth.uid() = id
    or public.is_owner()
    or (public.is_admin() and branch_id = public.current_branch_id())
  );
create policy users_owner_write on public.users
  for all using (public.is_owner()) with check (public.is_owner());
create policy users_admin_write on public.users
  for all
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (
    public.is_admin()
    and branch_id = public.current_branch_id()
    and role <> 'owner'   -- an admin can never mint an owner
  );

-- ----------------------------------------------------------------------------
-- BRANCHES
-- ----------------------------------------------------------------------------
create policy branches_owner_all on public.branches
  for all using (public.is_owner()) with check (public.is_owner());
create policy branches_member_read on public.branches
  for select using (
    public.is_active_user() and id = public.current_branch_id()
  );

-- ----------------------------------------------------------------------------
-- BANKS — stays company-wide / global. No branch predicate.
-- ----------------------------------------------------------------------------
drop policy banks_admin_write on public.banks;
create policy banks_admin_write on public.banks
  for all
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());

-- ----------------------------------------------------------------------------
-- CUSTOMERS
-- ----------------------------------------------------------------------------
drop policy customers_admin_emp_read   on public.customers;
drop policy customers_subid_read_own   on public.customers;
drop policy customers_admin_emp_insert on public.customers;
drop policy customers_subid_insert     on public.customers;
drop policy customers_admin_update     on public.customers;
drop policy customers_admin_delete     on public.customers;

create policy customers_owner_read on public.customers
  for select using (public.is_owner());
create policy customers_branch_emp_read on public.customers
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy customers_branch_subid_read_own on public.customers
  for select using (
    public.current_role() = 'sub_id'
    and created_by = auth.uid()
    and branch_id = public.current_branch_id()
  );
create policy customers_branch_emp_insert on public.customers
  for insert with check (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy customers_branch_subid_insert on public.customers
  for insert with check (
    public.current_role() = 'sub_id' and branch_id = public.current_branch_id()
  );
create policy customers_admin_update on public.customers
  for update
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (public.is_admin() and branch_id = public.current_branch_id());
create policy customers_admin_delete on public.customers
  for delete using (public.is_admin() and branch_id = public.current_branch_id());

-- ----------------------------------------------------------------------------
-- VEHICLES
-- ----------------------------------------------------------------------------
drop policy vehicles_read         on public.vehicles;
drop policy vehicles_insert       on public.vehicles;
drop policy vehicles_admin_update on public.vehicles;

create policy vehicles_owner_read on public.vehicles
  for select using (public.is_owner());
create policy vehicles_read on public.vehicles
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy vehicles_insert on public.vehicles
  for insert with check (
    (public.is_employee_or_admin() or public.current_role() = 'sub_id')
    and branch_id = public.current_branch_id()
  );
create policy vehicles_admin_update on public.vehicles
  for update
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (public.is_admin() and branch_id = public.current_branch_id());

-- ----------------------------------------------------------------------------
-- GUARANTORS
-- ----------------------------------------------------------------------------
drop policy guarantors_read         on public.guarantors;
drop policy guarantors_insert       on public.guarantors;
drop policy guarantors_admin_update on public.guarantors;

create policy guarantors_owner_read on public.guarantors
  for select using (public.is_owner());
create policy guarantors_read on public.guarantors
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy guarantors_insert on public.guarantors
  for insert with check (
    (public.is_employee_or_admin() or public.current_role() = 'sub_id')
    and branch_id = public.current_branch_id()
  );
create policy guarantors_admin_update on public.guarantors
  for update
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (public.is_admin() and branch_id = public.current_branch_id());

-- ----------------------------------------------------------------------------
-- LOANS
-- ----------------------------------------------------------------------------
drop policy loans_read         on public.loans;
drop policy loans_insert       on public.loans;
drop policy loans_admin_update on public.loans;

create policy loans_owner_read on public.loans
  for select using (public.is_owner());
create policy loans_read on public.loans
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy loans_insert on public.loans
  for insert with check (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy loans_admin_update on public.loans
  for update
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (public.is_admin() and branch_id = public.current_branch_id());

-- ----------------------------------------------------------------------------
-- PAYMENTS
-- ----------------------------------------------------------------------------
drop policy payments_read         on public.payments;
drop policy payments_insert       on public.payments;
drop policy payments_admin_update on public.payments;

create policy payments_owner_read on public.payments
  for select using (public.is_owner());
create policy payments_read on public.payments
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy payments_insert on public.payments
  for insert with check (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy payments_admin_update on public.payments
  for update
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (public.is_admin() and branch_id = public.current_branch_id());

-- ----------------------------------------------------------------------------
-- PENALTIES
-- ----------------------------------------------------------------------------
drop policy penalties_read        on public.penalties;
drop policy penalties_admin_write on public.penalties;

create policy penalties_owner_read on public.penalties
  for select using (public.is_owner());
create policy penalties_read on public.penalties
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy penalties_admin_write on public.penalties
  for all
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (public.is_admin() and branch_id = public.current_branch_id());

-- ----------------------------------------------------------------------------
-- SEIZURES
-- ----------------------------------------------------------------------------
drop policy seizures_read            on public.seizures;
drop policy seizures_employee_insert on public.seizures;
drop policy seizures_admin_update    on public.seizures;

create policy seizures_owner_read on public.seizures
  for select using (public.is_owner());
create policy seizures_read on public.seizures
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy seizures_employee_insert on public.seizures
  for insert with check (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy seizures_admin_update on public.seizures
  for update
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (public.is_admin() and branch_id = public.current_branch_id());

-- ----------------------------------------------------------------------------
-- FORECLOSURES
-- ----------------------------------------------------------------------------
drop policy foreclosures_read        on public.foreclosures;
drop policy foreclosures_admin_write on public.foreclosures;

create policy foreclosures_owner_read on public.foreclosures
  for select using (public.is_owner());
create policy foreclosures_read on public.foreclosures
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy foreclosures_admin_write on public.foreclosures
  for all
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (public.is_admin() and branch_id = public.current_branch_id());

-- ----------------------------------------------------------------------------
-- DOCUMENTS / KEYS
-- ----------------------------------------------------------------------------
drop policy docs_read        on public.documents_keys;
drop policy docs_admin_write on public.documents_keys;

create policy docs_owner_read on public.documents_keys
  for select using (public.is_owner());
create policy docs_read on public.documents_keys
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy docs_admin_write on public.documents_keys
  for all
  using (public.is_admin() and branch_id = public.current_branch_id())
  with check (public.is_admin() and branch_id = public.current_branch_id());

-- ----------------------------------------------------------------------------
-- AUDIT LOG — owner reads all; admin reads only their branch.
-- ----------------------------------------------------------------------------
drop policy audit_admin_read on public.audit_log;

create policy audit_owner_read on public.audit_log
  for select using (public.is_owner());
create policy audit_admin_read on public.audit_log
  for select using (
    public.is_admin() and branch_id = public.current_branch_id()
  );
