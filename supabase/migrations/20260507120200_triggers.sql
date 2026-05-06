-- Triggers — audit log, updated_at, auth user mirroring

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'users','customers','vehicles','guarantors','loans','penalties',
      'seizures','foreclosures','documents_keys'
    ])
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t, t);
  end loop;
end$$;

-- Audit log — captures user, action, before/after as jsonb
create or replace function public.audit_log_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec_id text;
begin
  rec_id := coalesce(
    (case when tg_op = 'DELETE' then (to_jsonb(old)->>'id') else (to_jsonb(new)->>'id') end),
    null
  );

  insert into public.audit_log(user_id, action, table_name, record_id, old_value, new_value)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    rec_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'users','banks','customers','vehicles','guarantors','loans','payments',
      'penalties','seizures','foreclosures','documents_keys'
    ])
  loop
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I
       for each row execute function public.audit_log_trigger()', t, t);
  end loop;
end$$;

-- Auto-create public.users row when an auth user is created
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, role)
  values (new.id, new.email, 'employee')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Sub-ID range enforcement (Phase 2 minimal — Phase 6 will tighten + auto-disable)
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
  select count(*) into cnt from public.customers where created_by = auth.uid();
  if cnt >= (u.sub_id_range_end - u.sub_id_range_start + 1) then
    raise exception 'sub-id range exhausted';
  end if;
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger customers_sub_id_range
  before insert on public.customers
  for each row execute function public.enforce_sub_id_range();
