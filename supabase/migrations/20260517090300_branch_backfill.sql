-- Phase 2.7 — Multi-Branch Foundation (4/6): seed default branch, backfill,
-- promote the owner, and lock down constraints.
--
-- Safe to reference 'owner' here: file 1 added the enum value in an earlier
-- (already committed) transaction.

-- 1. Default branch — absorbs every row created before multi-branch.
insert into public.branches (name, code, city)
values ('Main Branch', 'MAIN', 'Head Office')
on conflict (name) do nothing;

-- 2. Backfill every existing row into the Main Branch.
do $$
declare
  b uuid;
begin
  select id into b from public.branches where code = 'MAIN';

  update public.users          set branch_id = b where branch_id is null;
  update public.customers      set branch_id = b where branch_id is null;
  update public.vehicles       set branch_id = b where branch_id is null;
  update public.guarantors     set branch_id = b where branch_id is null;
  update public.loans          set branch_id = b where branch_id is null;
  update public.payments       set branch_id = b where branch_id is null;
  update public.penalties      set branch_id = b where branch_id is null;
  update public.seizures       set branch_id = b where branch_id is null;
  update public.foreclosures   set branch_id = b where branch_id is null;
  update public.documents_keys set branch_id = b where branch_id is null;
  -- audit_log is intentionally left as-is: historical rows keep branch_id NULL.
end$$;

-- 3. Promote the oldest admin to the single global owner (no branch).
update public.users
set role = 'owner',
    branch_id = null,
    sub_id_range_start = null,
    sub_id_range_end = null
where id = (
  select id from public.users
  where role = 'admin'
  order by created_at asc
  limit 1
);

-- 4. Operational tables: branch_id is now mandatory.
alter table public.customers      alter column branch_id set not null;
alter table public.vehicles       alter column branch_id set not null;
alter table public.guarantors     alter column branch_id set not null;
alter table public.loans          alter column branch_id set not null;
alter table public.payments       alter column branch_id set not null;
alter table public.penalties      alter column branch_id set not null;
alter table public.seizures       alter column branch_id set not null;
alter table public.foreclosures   alter column branch_id set not null;
alter table public.documents_keys alter column branch_id set not null;

-- 5. users.branch_id stays nullable (owner = NULL) but is required for every
--    other role.
alter table public.users
  add constraint users_branch_required_unless_owner
  check (role = 'owner' or branch_id is not null);
