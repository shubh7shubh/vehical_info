-- RLS policies — PRD §5 access matrix
-- Roles: admin (full), employee (read all + insert customers/payments), sub_id (insert customers in range)

-- helper: current user's role
create or replace function public.current_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and disabled_at is null;
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'admin', false);
$$;

create or replace function public.is_employee_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() in ('admin','employee'), false);
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and disabled_at is null);
$$;

alter table public.users          enable row level security;
alter table public.banks          enable row level security;
alter table public.customers      enable row level security;
alter table public.vehicles       enable row level security;
alter table public.guarantors     enable row level security;
alter table public.loans          enable row level security;
alter table public.payments       enable row level security;
alter table public.penalties      enable row level security;
alter table public.seizures       enable row level security;
alter table public.foreclosures   enable row level security;
alter table public.documents_keys enable row level security;
alter table public.audit_log      enable row level security;

-- USERS: self-read for everyone, admin full control
create policy users_self_read on public.users
  for select using (auth.uid() = id or public.is_admin());
create policy users_admin_write on public.users
  for all using (public.is_admin()) with check (public.is_admin());

-- BANKS: read by any active user, write admin-only
create policy banks_read on public.banks
  for select using (public.is_active_user());
create policy banks_admin_write on public.banks
  for all using (public.is_admin()) with check (public.is_admin());

-- CUSTOMERS: admin/employee read; sub_id read own-created only
create policy customers_admin_emp_read on public.customers
  for select using (public.is_employee_or_admin());
create policy customers_subid_read_own on public.customers
  for select using (
    public.current_role() = 'sub_id' and created_by = auth.uid()
  );

create policy customers_admin_emp_insert on public.customers
  for insert with check (public.is_employee_or_admin());

-- sub_id insert allowed; range enforcement is in trigger (Phase 6 hardens it)
create policy customers_subid_insert on public.customers
  for insert with check (public.current_role() = 'sub_id');

create policy customers_admin_update on public.customers
  for update using (public.is_admin()) with check (public.is_admin());
create policy customers_admin_delete on public.customers
  for delete using (public.is_admin());

-- VEHICLES / GUARANTORS: same pattern as customers (admin/employee + sub_id insert)
create policy vehicles_read on public.vehicles
  for select using (public.is_employee_or_admin());
create policy vehicles_insert on public.vehicles
  for insert with check (
    public.is_employee_or_admin() or public.current_role() = 'sub_id'
  );
create policy vehicles_admin_update on public.vehicles
  for update using (public.is_admin()) with check (public.is_admin());

create policy guarantors_read on public.guarantors
  for select using (public.is_employee_or_admin());
create policy guarantors_insert on public.guarantors
  for insert with check (
    public.is_employee_or_admin() or public.current_role() = 'sub_id'
  );
create policy guarantors_admin_update on public.guarantors
  for update using (public.is_admin()) with check (public.is_admin());

-- LOANS
create policy loans_read on public.loans
  for select using (public.is_employee_or_admin());
create policy loans_insert on public.loans
  for insert with check (public.is_employee_or_admin());
create policy loans_admin_update on public.loans
  for update using (public.is_admin()) with check (public.is_admin());

-- PAYMENTS: admin/employee read + insert
create policy payments_read on public.payments
  for select using (public.is_employee_or_admin());
create policy payments_insert on public.payments
  for insert with check (public.is_employee_or_admin());
create policy payments_admin_update on public.payments
  for update using (public.is_admin()) with check (public.is_admin());

-- PENALTIES: admin/employee read; only admin can mutate (employees see but cannot edit/waive)
create policy penalties_read on public.penalties
  for select using (public.is_employee_or_admin());
create policy penalties_admin_write on public.penalties
  for all using (public.is_admin()) with check (public.is_admin());

-- SEIZURES: employees can create + read; only admin updates/approves
create policy seizures_read on public.seizures
  for select using (public.is_employee_or_admin());
create policy seizures_employee_insert on public.seizures
  for insert with check (public.is_employee_or_admin());
create policy seizures_admin_update on public.seizures
  for update using (public.is_admin()) with check (public.is_admin());

-- FORECLOSURES: admin only writes; employees view
create policy foreclosures_read on public.foreclosures
  for select using (public.is_employee_or_admin());
create policy foreclosures_admin_write on public.foreclosures
  for all using (public.is_admin()) with check (public.is_admin());

-- DOCUMENTS / KEYS: admin writes; employees view
create policy docs_read on public.documents_keys
  for select using (public.is_employee_or_admin());
create policy docs_admin_write on public.documents_keys
  for all using (public.is_admin()) with check (public.is_admin());

-- AUDIT LOG: admin read-only; trigger inserts as security definer
create policy audit_admin_read on public.audit_log
  for select using (public.is_admin());
