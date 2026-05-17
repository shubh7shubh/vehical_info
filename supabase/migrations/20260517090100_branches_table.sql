-- Phase 2.7 — Multi-Branch Foundation (2/6): the `branches` tenant table.
--
-- One company, many branches. Each branch is an isolated unit run by its own
-- admin(s) + staff. `branches` RLS policies are created in file 5 (after the
-- is_owner() helper exists).

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,            -- short slug, e.g. 'PUN'
  city text,
  address text,
  phone text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz       -- soft-delete only (CLAUDE.md)
);

create index branches_deleted_idx on public.branches(deleted_at);

alter table public.branches enable row level security;

create trigger branches_set_updated_at before update on public.branches
  for each row execute function public.set_updated_at();

create trigger branches_audit after insert or update or delete on public.branches
  for each row execute function public.audit_log_trigger();
