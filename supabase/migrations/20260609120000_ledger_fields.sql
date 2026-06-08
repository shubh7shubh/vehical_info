-- Phase 4 (1/2) — Ledger fields: bring the schema in line with the physical loan
-- book. Additive only — Phase 3 (customer card, smart search, vehicles/guarantors)
-- keeps working. The flat ledger maps onto the existing normalized tables:
--   customers  gets the ledger header fields (account no, post office, district,
--              model no, purchase date)
--   payments   gets the monthly grid columns (month no, penalty, receipt no,
--              signature). total = amount_paise + penalty_paise (derived in UI)
--   followups  NEW table — the per-customer follow-up log (an array of {note, time})
--
-- Branch scoping is mandatory (CLAUDE.md): account_no is unique PER BRANCH (each
-- branch keeps its own physical book), and followups follows the full Phase 3+
-- table checklist (branch_id NOT NULL, set_branch_id trigger, branch index,
-- branch-scoped RLS + owner-read, audit trigger).

-- ----------------------------------------------------------------------------
-- CUSTOMERS — ledger header fields
-- ----------------------------------------------------------------------------
alter table public.customers
  add column account_no       text,   -- physical-book account number (e.g. 3473)
  add column address_post     text,   -- पु. post office
  add column address_district text,   -- जि. district
  add column model_no         text,   -- मॉडेल्स नं (vehicle model written in book)
  add column purchase_date    date;   -- दिनांक — anchors the monthly installment schedule

-- Per-branch dedup on the account number. Partial: ignores soft-deleted rows and
-- customers without an account number. Two branches CAN share number 3473.
create unique index customers_account_no_branch_uq
  on public.customers (branch_id, account_no)
  where account_no is not null and deleted_at is null;

-- ----------------------------------------------------------------------------
-- PAYMENTS — monthly ledger grid columns
-- ----------------------------------------------------------------------------
alter table public.payments
  add column month_no      int,                                       -- महिने (installment #)
  add column penalty_paise bigint not null default 0 check (penalty_paise >= 0),
  add column receipt_no    text,                                      -- पावती क्र
  add column signature     boolean not null default false;           -- सही

-- ----------------------------------------------------------------------------
-- FOLLOWUPS — per-customer follow-up log (array of {note, time})
-- Employees log a contact attempt each time they chase an overdue installment.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- set_branch_id() — add a 'followups' arm so the branch is derived from the
-- parent customer (same pattern as vehicles/guarantors/loans).
-- ----------------------------------------------------------------------------
create or replace function public.set_branch_id() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  parent_branch uuid;
begin
  if new.branch_id is not null then
    return new;
  end if;

  case tg_table_name
    when 'customers' then
      new.branch_id := public.current_branch_id();
    when 'vehicles' then
      select branch_id into parent_branch from public.customers where id = new.customer_id;
    when 'guarantors' then
      select branch_id into parent_branch from public.customers where id = new.customer_id;
    when 'loans' then
      select branch_id into parent_branch from public.customers where id = new.customer_id;
    when 'followups' then
      select branch_id into parent_branch from public.customers where id = new.customer_id;
    when 'seizures' then
      select branch_id into parent_branch from public.customers where id = new.customer_id;
    when 'documents_keys' then
      select branch_id into parent_branch from public.customers where id = new.customer_id;
    when 'payments' then
      select branch_id into parent_branch from public.loans where id = new.loan_id;
    when 'penalties' then
      select branch_id into parent_branch from public.loans where id = new.loan_id;
    when 'foreclosures' then
      select branch_id into parent_branch from public.loans where id = new.loan_id;
    else
      new.branch_id := public.current_branch_id();
  end case;

  if new.branch_id is null then
    new.branch_id := parent_branch;
  end if;

  if new.branch_id is null then
    raise exception 'cannot determine branch_id for % insert', tg_table_name;
  end if;

  return new;
end;
$$;

create trigger followups_set_branch_id before insert on public.followups
  for each row execute function public.set_branch_id();
create trigger followups_audit
  after insert or update or delete on public.followups
  for each row execute function public.audit_log_trigger();

-- ----------------------------------------------------------------------------
-- FOLLOWUPS RLS — branch-scoped read/insert for staff; owner reads all.
-- ----------------------------------------------------------------------------
alter table public.followups enable row level security;

create policy followups_owner_read on public.followups
  for select using (public.is_owner());
create policy followups_read on public.followups
  for select using (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
create policy followups_insert on public.followups
  for insert with check (
    public.is_employee_or_admin() and branch_id = public.current_branch_id()
  );
