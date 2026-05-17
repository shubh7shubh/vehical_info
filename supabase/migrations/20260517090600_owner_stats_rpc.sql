-- Phase 2.7 — Multi-Branch Foundation: owner cross-branch stats RPC.
--
-- Business logic lives in Postgres (CLAUDE.md). One row per branch with the
-- counts the owner dashboard needs. security definer so it can aggregate
-- across every branch, but it self-checks is_owner() first. Empty Phase 3+
-- tables simply yield 0 counts.

create or replace function public.owner_branch_stats()
returns table (
  branch_id uuid,
  branch_name text,
  branch_code text,
  city text,
  deleted_at timestamptz,
  admin_count bigint,
  employee_count bigint,
  sub_id_count bigint,
  customer_count bigint,
  active_loan_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized';
  end if;

  return query
  select
    b.id,
    b.name,
    b.code,
    b.city,
    b.deleted_at,
    (select count(*) from public.users u
       where u.branch_id = b.id and u.role = 'admin' and u.disabled_at is null),
    (select count(*) from public.users u
       where u.branch_id = b.id and u.role = 'employee' and u.disabled_at is null),
    (select count(*) from public.users u
       where u.branch_id = b.id and u.role = 'sub_id' and u.disabled_at is null),
    (select count(*) from public.customers c
       where c.branch_id = b.id and c.deleted_at is null),
    (select count(*) from public.loans l
       where l.branch_id = b.id and l.status = 'active')
  from public.branches b
  order by b.created_at asc;
end;
$$;
