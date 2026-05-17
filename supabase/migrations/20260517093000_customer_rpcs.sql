-- Phase 3 — Customer Management: onboarding + smart-search RPCs.
--
-- Business logic lives in Postgres (CLAUDE.md). `create_customer` is the single
-- transactional onboarding entry point — customer + vehicle + guarantor + loan
-- are written in one function call, so a partial failure rolls back entirely
-- (PRD §6.2 "all writes use transactional database operations").

-- ----------------------------------------------------------------------------
-- create_customer(p jsonb) -> uuid
-- security definer: validates the caller itself, runs global duplicate checks
-- (RC / engine numbers are real-world unique, not branch-scoped), and stamps
-- the caller's branch on every row.
-- ----------------------------------------------------------------------------
create or replace function public.create_customer(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  new_customer_id uuid;
  v_rc text;
  v_e1 text;
  v_e2 text;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role not in ('admin','employee','sub_id') then
    raise exception 'Your role cannot add customers';
  end if;
  if caller.branch_id is null then
    raise exception 'Your account is not assigned to a branch';
  end if;

  if nullif(btrim(p->'customer'->>'first_name'), '') is null then
    raise exception 'Customer first name is required';
  end if;
  if nullif(p->'customer'->>'bank_id', '') is null then
    raise exception 'A bank must be selected';
  end if;

  v_rc := nullif(btrim(p->'vehicle'->>'rc_no'), '');
  v_e1 := nullif(btrim(p->'vehicle'->>'engine_no_1'), '');
  v_e2 := nullif(btrim(p->'vehicle'->>'engine_no_2'), '');

  -- Duplicate detection — global (an RC / engine number is a unique vehicle).
  if v_rc is not null and exists (
       select 1 from public.vehicles where lower(rc_no) = lower(v_rc)
     ) then
    raise exception 'A vehicle with RC number % already exists', v_rc;
  end if;
  if v_e1 is not null and exists (
       select 1 from public.vehicles
       where lower(engine_no_1) = lower(v_e1)
          or lower(engine_no_2) = lower(v_e1)
     ) then
    raise exception 'A vehicle with engine number % already exists', v_e1;
  end if;

  insert into public.customers (
    first_name, middle_name, last_name, address_taluka, address_village,
    mobiles, aadhaar, bank_id, branch_id, created_by
  ) values (
    btrim(p->'customer'->>'first_name'),
    nullif(btrim(p->'customer'->>'middle_name'), ''),
    nullif(btrim(p->'customer'->>'last_name'), ''),
    nullif(btrim(p->'customer'->>'address_taluka'), ''),
    nullif(btrim(p->'customer'->>'address_village'), ''),
    coalesce(
      (select array_agg(btrim(x))
         from jsonb_array_elements_text(p->'customer'->'mobiles') x
        where btrim(x) <> ''),
      '{}'::text[]
    ),
    nullif(btrim(p->'customer'->>'aadhaar'), ''),
    (p->'customer'->>'bank_id')::uuid,
    caller.branch_id,
    auth.uid()
  ) returning id into new_customer_id;

  -- One vehicle row per customer (engine fields may be blank — flagged in UI).
  insert into public.vehicles (
    customer_id, vehicle_name, rc_no, engine_no_1, engine_no_2, chassis_no,
    branch_id
  ) values (
    new_customer_id,
    nullif(btrim(p->'vehicle'->>'vehicle_name'), ''),
    v_rc, v_e1, v_e2,
    nullif(btrim(p->'vehicle'->>'chassis_no'), ''),
    caller.branch_id
  );

  -- Guarantor is optional — created only when a name is supplied.
  if nullif(btrim(p->'guarantor'->>'name'), '') is not null then
    insert into public.guarantors (customer_id, name, mobile, address, branch_id)
    values (
      new_customer_id,
      btrim(p->'guarantor'->>'name'),
      nullif(btrim(p->'guarantor'->>'mobile'), ''),
      nullif(btrim(p->'guarantor'->>'address'), ''),
      caller.branch_id
    );
  end if;

  -- Loan. Penalty config left to table defaults (per_day ₹50, 2-day grace).
  insert into public.loans (
    customer_id, principal_paise, emi_paise, tenure_months, due_day,
    started_at, branch_id
  ) values (
    new_customer_id,
    (p->'loan'->>'principal_paise')::bigint,
    (p->'loan'->>'emi_paise')::bigint,
    (p->'loan'->>'tenure_months')::int,
    (p->'loan'->>'due_day')::int,
    (p->'loan'->>'started_at')::date,
    caller.branch_id
  );

  return new_customer_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- search_customers(q text) -> table
-- security invoker: the SELECT runs as the caller, so branch-scoped RLS applies
-- automatically — an admin/employee only ever searches their own branch.
-- Matches name (partial), RC, engine, chassis, Aadhaar, or any mobile.
-- ----------------------------------------------------------------------------
create or replace function public.search_customers(q text)
returns table (
  id uuid,
  first_name text,
  middle_name text,
  last_name text,
  address_village text,
  address_taluka text,
  mobiles text[],
  aadhaar text,
  rc_no text,
  vehicle_name text,
  engine_missing boolean,
  bank_name text
)
language sql stable security invoker set search_path = public as $$
  select
    c.id, c.first_name, c.middle_name, c.last_name,
    c.address_village, c.address_taluka, c.mobiles, c.aadhaar,
    v.rc_no, v.vehicle_name,
    (v.customer_id is null
       or v.engine_no_1 is null or btrim(v.engine_no_1) = '') as engine_missing,
    b.name
  from public.customers c
  left join public.vehicles v on v.customer_id = c.id
  left join public.banks b on b.id = c.bank_id
  where c.deleted_at is null
    and btrim(coalesce(q, '')) <> ''
    and (
      (c.first_name || ' ' || coalesce(c.middle_name, '') || ' '
        || coalesce(c.last_name, '')) ilike '%' || btrim(q) || '%'
      or v.rc_no ilike '%' || btrim(q) || '%'
      or v.engine_no_1 ilike '%' || btrim(q) || '%'
      or v.engine_no_2 ilike '%' || btrim(q) || '%'
      or v.chassis_no ilike '%' || btrim(q) || '%'
      or c.aadhaar ilike '%' || btrim(q) || '%'
      or exists (
        select 1 from unnest(c.mobiles) m where m ilike '%' || btrim(q) || '%'
      )
    )
  order by c.first_name, c.last_name
  limit 25;
$$;
