-- Phase 2.7 — Multi-Branch Foundation (6/6): branch-aware triggers.

-- ----------------------------------------------------------------------------
-- set_branch_id() — stamp branch_id on insert.
-- An explicit branch_id (e.g. from a server action) always wins. Otherwise it
-- is derived: customers from the current user's branch; child tables from
-- their parent row. Raises if it cannot be resolved, so a row can never be
-- created without a branch.
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

-- Trigger name `<table>_set_branch_id` sorts before the existing
-- `customers_sub_id_range` trigger, so branch_id is stamped before the sub-id
-- range check reads it. Postgres fires before-row triggers alphabetically.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'customers','vehicles','guarantors','loans','payments',
      'penalties','seizures','foreclosures','documents_keys'
    ])
  loop
    execute format(
      'create trigger %I_set_branch_id before insert on public.%I
       for each row execute function public.set_branch_id()', t, t);
  end loop;
end$$;

-- ----------------------------------------------------------------------------
-- handle_new_auth_user() — new public.users rows default to the Main Branch so
-- the users_branch_required_unless_owner CHECK is never transiently violated.
-- The create-user / create-branch-admin server actions then UPDATE branch_id
-- (and role) to the real target.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  main_branch uuid;
begin
  select id into main_branch from public.branches where code = 'MAIN';

  insert into public.users (id, email, role, branch_id)
  values (new.id, new.email, 'employee', main_branch)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- audit_log_trigger() — also records the affected row's branch_id.
-- banks rows have no branch_id key -> NULL (correct, banks are global).
-- ----------------------------------------------------------------------------
create or replace function public.audit_log_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec_id text;
  rec_branch uuid;
begin
  rec_id := coalesce(
    (case when tg_op = 'DELETE' then (to_jsonb(old)->>'id') else (to_jsonb(new)->>'id') end),
    null
  );
  rec_branch := nullif(
    (case when tg_op = 'DELETE' then (to_jsonb(old)->>'branch_id')
          else (to_jsonb(new)->>'branch_id') end),
    ''
  )::uuid;

  insert into public.audit_log(user_id, action, table_name, record_id,
                               old_value, new_value, branch_id)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    rec_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end,
    rec_branch
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ----------------------------------------------------------------------------
-- enforce_sub_id_range() — count the sub-id's own customers within its branch.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_sub_id_range() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u public.users;
  cnt int;
begin
  select * into u from public.users where id = auth.uid();
  if u.role <> 'sub_id' then
    return new;
  end if;
  if u.disabled_at is not null then
    raise exception 'sub-id account disabled';
  end if;
  if u.sub_id_range_start is null or u.sub_id_range_end is null then
    raise exception 'sub-id has no assigned range';
  end if;
  select count(*) into cnt from public.customers
  where created_by = auth.uid() and branch_id = u.branch_id;
  if cnt >= (u.sub_id_range_end - u.sub_id_range_start + 1) then
    raise exception 'sub-id range exhausted';
  end if;
  new.created_by := auth.uid();
  return new;
end;
$$;
