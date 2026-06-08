-- Phase 4 (2/2) — Ledger RPCs.
--
-- Business logic lives in Postgres (CLAUDE.md). This migration:
--   * extends create_customer with the ledger header fields + per-branch
--     account-number dedup, and anchors the loan to the purchase date;
--   * adds log_payment (the installment-registry write);
--   * adds customer_status_counts (the 4 colored reminder buckets, per branch);
--   * extends owner_branch_stats with the same 4 buckets per branch;
--   * extends search_customers to also match / return the account number.
--
-- Reminder buckets are pure months-behind:
--   0 -> green, 1..2 -> yellow, 3 -> orange, >3 -> red.
-- months_elapsed() below is the single source of truth for "how many monthly
-- installments are due by now"; the TS helper lib/loan-status.ts mirrors it
-- exactly so the UI and DB never disagree.

-- ----------------------------------------------------------------------------
-- months_elapsed(from, to) — whole calendar months completed since `from`.
-- A month completes on the same day-of-month (purchase 15 Jan -> 1 on 15 Feb,
-- still 0 on 14 Feb). Never negative.
-- ----------------------------------------------------------------------------
create or replace function public.months_elapsed(p_from date, p_to date)
returns int language sql stable set search_path = public as $$
  select greatest(
    (extract(year  from age(p_to, p_from)) * 12
   + extract(month from age(p_to, p_from)))::int,
    0);
$$;

-- ----------------------------------------------------------------------------
-- create_customer(p jsonb) -> uuid  (extends Phase 3)
-- New: account_no / address_post / address_district / model_no on the customer,
-- and loan.purchase_date which anchors the schedule (started_at + due_day).
-- Account number is deduped PER BRANCH (each branch keeps its own book).
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
  v_acct text;
  v_purchase date;
  v_due_day int;
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

  v_acct := nullif(btrim(p->'customer'->>'account_no'), '');
  v_rc := nullif(btrim(p->'vehicle'->>'rc_no'), '');
  v_e1 := nullif(btrim(p->'vehicle'->>'engine_no_1'), '');
  v_e2 := nullif(btrim(p->'vehicle'->>'engine_no_2'), '');

  -- Per-branch dedup on the physical-book account number.
  if v_acct is not null and exists (
       select 1 from public.customers
        where branch_id = caller.branch_id
          and account_no = v_acct
          and deleted_at is null
     ) then
    raise exception 'A customer with account number % already exists', v_acct;
  end if;

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

  -- Purchase date anchors the loan. Accept either key; fall back to started_at
  -- for the legacy onboarding form. due_day defaults to the purchase day.
  v_purchase := coalesce(
    nullif(p->'loan'->>'purchase_date', '')::date,
    nullif(p->'loan'->>'started_at', '')::date
  );
  if v_purchase is null then
    raise exception 'Purchase / loan start date is required';
  end if;
  v_due_day := coalesce(
    nullif(p->'loan'->>'due_day', '')::int,
    extract(day from v_purchase)::int
  );

  insert into public.customers (
    first_name, middle_name, last_name, address_taluka, address_village,
    address_post, address_district, account_no, model_no, purchase_date,
    mobiles, aadhaar, bank_id, branch_id, created_by
  ) values (
    btrim(p->'customer'->>'first_name'),
    nullif(btrim(p->'customer'->>'middle_name'), ''),
    nullif(btrim(p->'customer'->>'last_name'), ''),
    nullif(btrim(p->'customer'->>'address_taluka'), ''),
    nullif(btrim(p->'customer'->>'address_village'), ''),
    nullif(btrim(p->'customer'->>'address_post'), ''),
    nullif(btrim(p->'customer'->>'address_district'), ''),
    v_acct,
    nullif(btrim(p->'customer'->>'model_no'), ''),
    v_purchase,
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
    v_due_day,
    v_purchase,
    caller.branch_id
  );

  return new_customer_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- log_payment(p jsonb) -> uuid  — the installment-registry write.
-- Employee/admin only (owner is read-only). Resolves the customer's active loan
-- within the caller's branch, then records one installment row.
-- Input: { customer_id, month_no, installment_paise, penalty_paise,
--          receipt_no, signature, mode, paid_at }
-- ----------------------------------------------------------------------------
create or replace function public.log_payment(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  v_customer uuid;
  v_loan public.loans;
  new_id uuid;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role not in ('admin','employee') then
    raise exception 'Your role cannot log payments';
  end if;
  if caller.branch_id is null then
    raise exception 'Your account is not assigned to a branch';
  end if;

  v_customer := nullif(p->>'customer_id', '')::uuid;
  if v_customer is null then
    raise exception 'A customer is required';
  end if;

  -- Active loan, scoped to the caller's branch (blocks cross-branch writes even
  -- though this is security definer).
  select * into v_loan from public.loans
   where customer_id = v_customer
     and branch_id = caller.branch_id
     and status = 'active'
   order by started_at desc
   limit 1;
  if v_loan.id is null then
    raise exception 'No active loan found for this customer in your branch';
  end if;

  if nullif(p->>'installment_paise', '') is null
     or (p->>'installment_paise')::bigint <= 0 then
    raise exception 'Installment amount must be greater than 0';
  end if;

  insert into public.payments (
    loan_id, amount_paise, penalty_paise, mode, month_no, receipt_no,
    signature, paid_at, recorded_by, branch_id
  ) values (
    v_loan.id,
    (p->>'installment_paise')::bigint,
    coalesce(nullif(p->>'penalty_paise', '')::bigint, 0),
    coalesce(nullif(p->>'mode', '')::payment_mode, 'cash'),
    nullif(p->>'month_no', '')::int,
    nullif(btrim(p->>'receipt_no'), ''),
    coalesce((p->>'signature')::boolean, false),
    coalesce(nullif(p->>'paid_at', '')::timestamptz, now()),
    auth.uid(),
    caller.branch_id
  ) returning id into new_id;

  return new_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- customer_status_counts() -> (green, yellow, orange, red)
-- security invoker: branch-scoped RLS applies, so a staff member only ever
-- counts their own branch. behind = due-by-now minus installments paid.
-- ----------------------------------------------------------------------------
create or replace function public.customer_status_counts()
returns table (green int, yellow int, orange int, red int)
language sql stable security invoker set search_path = public as $$
  with b as (
    select greatest(
      least(public.months_elapsed(c.purchase_date, current_date), l.tenure_months)
        - (select count(*) from public.payments pm where pm.loan_id = l.id),
      0) as behind
    from public.customers c
    join public.loans l on l.customer_id = c.id and l.status = 'active'
    where c.deleted_at is null and c.purchase_date is not null
  )
  select
    count(*) filter (where behind = 0)::int,
    count(*) filter (where behind between 1 and 2)::int,
    count(*) filter (where behind = 3)::int,
    count(*) filter (where behind > 3)::int
  from b;
$$;

-- ----------------------------------------------------------------------------
-- owner_branch_stats() — add the 4 reminder buckets per branch so the owner
-- dashboard / drill-down shows each branch's green/yellow/orange/red.
-- Dropped first: the return TABLE signature changed (4 new columns) and
-- `create or replace` cannot change a function's return type.
-- ----------------------------------------------------------------------------
drop function if exists public.owner_branch_stats();
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
  active_loan_count bigint,
  green bigint,
  yellow bigint,
  orange bigint,
  red bigint
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
       where l.branch_id = b.id and l.status = 'active'),
    coalesce(sc.green, 0),
    coalesce(sc.yellow, 0),
    coalesce(sc.orange, 0),
    coalesce(sc.red, 0)
  from public.branches b
  left join lateral (
    select
      count(*) filter (where per.behind = 0)            as green,
      count(*) filter (where per.behind between 1 and 2) as yellow,
      count(*) filter (where per.behind = 3)            as orange,
      count(*) filter (where per.behind > 3)            as red
    from (
      select greatest(
        least(public.months_elapsed(c.purchase_date, current_date), l.tenure_months)
          - (select count(*) from public.payments pm where pm.loan_id = l.id),
        0) as behind
      from public.customers c
      join public.loans l on l.customer_id = c.id and l.status = 'active'
      where c.branch_id = b.id and c.deleted_at is null and c.purchase_date is not null
    ) per
  ) sc on true
  order by b.created_at asc;
end;
$$;

-- ----------------------------------------------------------------------------
-- search_customers(q text) — also match and return the account number, so the
-- installment registry can look a customer up by their book number.
-- Dropped first: the return TABLE signature changed (account_no column added).
-- ----------------------------------------------------------------------------
drop function if exists public.search_customers(text);
create or replace function public.search_customers(q text)
returns table (
  id uuid,
  first_name text,
  middle_name text,
  last_name text,
  address_village text,
  address_taluka text,
  account_no text,
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
    c.address_village, c.address_taluka, c.account_no, c.mobiles, c.aadhaar,
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
      or c.account_no ilike '%' || btrim(q) || '%'
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
