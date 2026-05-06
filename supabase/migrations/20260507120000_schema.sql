-- Vehicle Finance Loan Management — Phase 2 schema
-- Money fields stored as integer paise (avoid float). Timestamps UTC.

create extension if not exists pg_trgm;

create type app_role as enum ('admin', 'employee', 'sub_id');
create type penalty_type as enum ('per_day', 'monthly_fixed');
create type payment_mode as enum ('cash', 'online');
create type seizure_status as enum ('pending', 'active', 'resolved');
create type loan_status as enum ('active', 'closed', 'foreclosed');
create type handover_status as enum ('pending', 'done');

-- public.users mirrors auth.users with role + sub-id metadata
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role app_role not null default 'employee',
  sub_id_range_start int,
  sub_id_range_end int,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_name text,
  last_name text,
  address_taluka text,
  address_village text,
  mobiles text[] not null default '{}',
  aadhaar text,
  bank_id uuid not null references public.banks(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index customers_name_trgm on public.customers using gin (
  (first_name || ' ' || coalesce(middle_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops
);
create index customers_aadhaar_idx on public.customers(aadhaar);
create index customers_mobiles_idx on public.customers using gin (mobiles);
create index customers_bank_idx on public.customers(bank_id);
create index customers_deleted_idx on public.customers(deleted_at);

create table public.vehicles (
  customer_id uuid primary key references public.customers(id) on delete restrict,
  vehicle_name text,
  rc_no text unique,
  engine_no_1 text,
  engine_no_2 text,
  chassis_no text,
  updated_at timestamptz not null default now()
);

create index vehicles_engine1_idx on public.vehicles(engine_no_1);
create index vehicles_engine2_idx on public.vehicles(engine_no_2);

create table public.guarantors (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null,
  mobile text,
  address text,
  updated_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  principal_paise bigint not null check (principal_paise >= 0),
  emi_paise bigint not null check (emi_paise > 0),
  tenure_months int not null check (tenure_months > 0),
  due_day int not null check (due_day between 1 and 31),
  grace_days int not null default 2 check (grace_days >= 0),
  penalty_type penalty_type not null default 'per_day',
  penalty_rate_paise bigint not null default 5000, -- ₹50/day default
  status loan_status not null default 'active',
  started_at date not null,
  closed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index loans_customer_idx on public.loans(customer_id);
create index loans_status_idx on public.loans(status);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  mode payment_mode not null,
  utr text,
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index payments_loan_idx on public.payments(loan_id);
create index payments_paid_at_idx on public.payments(paid_at);

create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  amount_paise bigint not null check (amount_paise >= 0),
  waived_by uuid references public.users(id),
  waived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index penalties_loan_idx on public.penalties(loan_id);

create table public.seizures (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount_paise bigint not null check (amount_paise >= 0),
  notes text,
  status seizure_status not null default 'pending',
  created_by uuid references public.users(id),
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.foreclosures (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  calculated_at timestamptz not null default now(),
  original_interest_paise bigint not null,
  bank_charge_paise bigint not null,
  final_payable_paise bigint not null,
  paid_at timestamptz,
  noc_issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index foreclosures_loan_idx on public.foreclosures(loan_id);

create table public.documents_keys (
  customer_id uuid primary key references public.customers(id) on delete restrict,
  key_status handover_status not null default 'pending',
  key_handover_date date,
  key_received_by text,
  doc_status handover_status not null default 'pending',
  doc_handover_date date,
  bank_doc_status handover_status not null default 'pending',
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigserial primary key,
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  at timestamptz not null default now()
);

create index audit_log_at_idx on public.audit_log(at desc);
create index audit_log_table_idx on public.audit_log(table_name);
