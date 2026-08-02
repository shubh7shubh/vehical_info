-- Phase 4.5 (2/2) — Client feedback round 2: RPCs.
--
--   * installments_due()        NEW shared schedule helper (first-EMI anchored)
--   * create_customer()      v3 accepts + derives loan.first_emi_date
--   * log_payment()          v2 stamps the printable invoice number
--   * payment_receipt()         NEW read model for the printed EMI receipt
--   * update_customer()         NEW — the Edit button on the customer card
--   * customer_status_counts()  re-anchored on the first-EMI date
--   * owner_branch_stats()      re-anchored on the first-EMI date
--
-- Business logic lives in Postgres (CLAUDE.md); the server actions only validate,
-- check auth and call these. lib/loan-status.ts mirrors installments_due()
-- exactly — change the two together or the UI and DB will disagree.

-- ----------------------------------------------------------------------------
-- installments_due(first_emi, purchase, tenure, as_of) -> int
--
-- How many installments have fallen due by `as_of`. Installment 1 is due ON the
-- first-EMI date, so the count is months_elapsed + 1 once that date arrives, and
-- 0 before it. Capped at the tenure.
--
-- first_emi is nullable on purpose (see the 20260802120000 migration): rows
-- created before this change fall back to purchase_date + 1 month, which is
-- exactly the schedule the old purchase-anchored math assumed. With that
-- fallback this function returns the same numbers as the previous
-- `least(months_elapsed(purchase, today), tenure)` — no bucket moves.
-- ----------------------------------------------------------------------------
create or replace function public.installments_due(
  p_first_emi date,
  p_purchase  date,
  p_tenure    int,
  p_as_of     date default current_date
)
returns int language sql stable set search_path = public as $$
  select case
    when coalesce(p_first_emi, (p_purchase + interval '1 month')::date) is null
      then 0
    when p_as_of < coalesce(p_first_emi, (p_purchase + interval '1 month')::date)
      then 0
    else least(
      public.months_elapsed(
        coalesce(p_first_emi, (p_purchase + interval '1 month')::date),
        p_as_of
      ) + 1,
      p_tenure
    )
  end;
$$;

-- ----------------------------------------------------------------------------
-- create_customer(p jsonb) -> uuid   (v3)
-- New: loan.first_emi_date. Defaults to purchase date + 1 month, and now drives
-- due_day (the day of the month the customer pays).
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
  v_first_emi date;
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
  -- for the legacy onboarding form.
  v_purchase := coalesce(
    nullif(p->'loan'->>'purchase_date', '')::date,
    nullif(p->'loan'->>'started_at', '')::date
  );
  if v_purchase is null then
    raise exception 'Purchase / loan start date is required';
  end if;

  -- First EMI falls one month after purchase unless the branch says otherwise.
  v_first_emi := coalesce(
    nullif(p->'loan'->>'first_emi_date', '')::date,
    (v_purchase + interval '1 month')::date
  );
  if v_first_emi < v_purchase then
    raise exception 'First EMI date cannot be before the purchase date';
  end if;

  -- The customer pays on the day of the month the first EMI falls on.
  v_due_day := coalesce(
    nullif(p->'loan'->>'due_day', '')::int,
    extract(day from v_first_emi)::int
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

  -- Loan. Penalty config left to table defaults (now monthly_fixed Rs 500,
  -- 2-day grace) so a future default change applies without touching this RPC.
  insert into public.loans (
    customer_id, principal_paise, emi_paise, tenure_months, due_day,
    started_at, first_emi_date, branch_id
  ) values (
    new_customer_id,
    (p->'loan'->>'principal_paise')::bigint,
    (p->'loan'->>'emi_paise')::bigint,
    (p->'loan'->>'tenure_months')::int,
    v_due_day,
    v_purchase,
    v_first_emi,
    caller.branch_id
  );

  return new_customer_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- update_customer(p jsonb) -> uuid   NEW
--
-- Backs the Edit button on the customer card. security definer for the same
-- reason create_customer is: the RLS UPDATE policies are admin-only, but the
-- client wants employees to be able to fix a record in the field. The role and
-- branch checks below are the real gate — an employee still cannot touch another
-- branch's rows, and sub_id / owner are rejected outright.
--
-- Recorded payments are never touched here.
-- Input: { customer_id, customer:{}, vehicle:{}, guarantor:{}, loan:{} }
-- ----------------------------------------------------------------------------
create or replace function public.update_customer(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  target public.customers;
  v_loan public.loans;
  v_id uuid;
  v_rc text;
  v_e1 text;
  v_e2 text;
  v_acct text;
  v_purchase date;
  v_first_emi date;
  v_due_day int;
  v_tenure int;
  v_paid int;
  v_touched int;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role not in ('admin','employee') then
    raise exception 'Your role cannot edit customers';
  end if;
  if caller.branch_id is null then
    raise exception 'Your account is not assigned to a branch';
  end if;

  v_id := nullif(p->>'customer_id', '')::uuid;
  if v_id is null then
    raise exception 'A customer is required';
  end if;

  -- Scoped to the caller's branch even though this is security definer.
  select * into target from public.customers
   where id = v_id and branch_id = caller.branch_id and deleted_at is null;
  if target.id is null then
    raise exception 'Customer not found in your branch';
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

  -- Same dedup rules as create_customer, but excluding the row being edited —
  -- otherwise saving an unchanged form would collide with itself.
  if v_acct is not null and exists (
       select 1 from public.customers
        where branch_id = caller.branch_id
          and account_no = v_acct
          and deleted_at is null
          and id <> v_id
     ) then
    raise exception 'A customer with account number % already exists', v_acct;
  end if;

  if v_rc is not null and exists (
       select 1 from public.vehicles
        where lower(rc_no) = lower(v_rc) and customer_id <> v_id
     ) then
    raise exception 'A vehicle with RC number % already exists', v_rc;
  end if;
  if v_e1 is not null and exists (
       select 1 from public.vehicles
        where (lower(engine_no_1) = lower(v_e1) or lower(engine_no_2) = lower(v_e1))
          and customer_id <> v_id
     ) then
    raise exception 'A vehicle with engine number % already exists', v_e1;
  end if;

  update public.customers set
    first_name       = btrim(p->'customer'->>'first_name'),
    middle_name      = nullif(btrim(p->'customer'->>'middle_name'), ''),
    last_name        = nullif(btrim(p->'customer'->>'last_name'), ''),
    address_taluka   = nullif(btrim(p->'customer'->>'address_taluka'), ''),
    address_village  = nullif(btrim(p->'customer'->>'address_village'), ''),
    address_post     = nullif(btrim(p->'customer'->>'address_post'), ''),
    address_district = nullif(btrim(p->'customer'->>'address_district'), ''),
    account_no       = v_acct,
    model_no         = nullif(btrim(p->'customer'->>'model_no'), ''),
    mobiles          = coalesce(
      (select array_agg(btrim(x))
         from jsonb_array_elements_text(p->'customer'->'mobiles') x
        where btrim(x) <> ''),
      '{}'::text[]
    ),
    aadhaar          = nullif(btrim(p->'customer'->>'aadhaar'), ''),
    bank_id          = (p->'customer'->>'bank_id')::uuid
  where id = v_id;

  -- Vehicle — update the existing row, or create one if this customer somehow
  -- has none (create_customer always makes one, but be defensive).
  update public.vehicles set
    vehicle_name = nullif(btrim(p->'vehicle'->>'vehicle_name'), ''),
    rc_no        = v_rc,
    engine_no_1  = v_e1,
    engine_no_2  = v_e2,
    chassis_no   = nullif(btrim(p->'vehicle'->>'chassis_no'), '')
  where customer_id = v_id;
  get diagnostics v_touched = row_count;
  if v_touched = 0 then
    insert into public.vehicles (
      customer_id, vehicle_name, rc_no, engine_no_1, engine_no_2, chassis_no,
      branch_id
    ) values (
      v_id,
      nullif(btrim(p->'vehicle'->>'vehicle_name'), ''),
      v_rc, v_e1, v_e2,
      nullif(btrim(p->'vehicle'->>'chassis_no'), ''),
      target.branch_id
    );
  end if;

  -- Guarantor — upsert when a name is supplied. A blank name leaves any existing
  -- guarantor untouched rather than silently wiping it (soft-delete only, v1).
  if nullif(btrim(p->'guarantor'->>'name'), '') is not null then
    update public.guarantors set
      name    = btrim(p->'guarantor'->>'name'),
      mobile  = nullif(btrim(p->'guarantor'->>'mobile'), ''),
      address = nullif(btrim(p->'guarantor'->>'address'), '')
    where customer_id = v_id;
    get diagnostics v_touched = row_count;
    if v_touched = 0 then
      insert into public.guarantors (customer_id, name, mobile, address, branch_id)
      values (
        v_id,
        btrim(p->'guarantor'->>'name'),
        nullif(btrim(p->'guarantor'->>'mobile'), ''),
        nullif(btrim(p->'guarantor'->>'address'), ''),
        target.branch_id
      );
    end if;
  end if;

  -- Loan — the active one, else the most recent.
  select * into v_loan from public.loans
   where customer_id = v_id and branch_id = caller.branch_id
   order by (status = 'active') desc, started_at desc
   limit 1;

  if v_loan.id is not null then
    v_purchase := coalesce(
      nullif(p->'loan'->>'purchase_date', '')::date,
      v_loan.started_at
    );
    v_first_emi := coalesce(
      nullif(p->'loan'->>'first_emi_date', '')::date,
      (v_purchase + interval '1 month')::date
    );
    if v_first_emi < v_purchase then
      raise exception 'First EMI date cannot be before the purchase date';
    end if;
    v_due_day := coalesce(
      nullif(p->'loan'->>'due_day', '')::int,
      extract(day from v_first_emi)::int
    );
    v_tenure := coalesce(
      nullif(p->'loan'->>'tenure_months', '')::int,
      v_loan.tenure_months
    );

    -- Shortening the tenure below what has already been collected would make the
    -- ledger unreadable ("Paid 8 of 6").
    select count(*)::int into v_paid from public.payments where loan_id = v_loan.id;
    if v_tenure < v_paid then
      raise exception 'Tenure cannot be less than the % installments already recorded', v_paid;
    end if;

    update public.loans set
      principal_paise = coalesce(nullif(p->'loan'->>'principal_paise', '')::bigint,
                                 v_loan.principal_paise),
      emi_paise       = coalesce(nullif(p->'loan'->>'emi_paise', '')::bigint,
                                 v_loan.emi_paise),
      tenure_months   = v_tenure,
      due_day         = v_due_day,
      started_at      = v_purchase,
      first_emi_date  = v_first_emi
    where id = v_loan.id;

    -- customers.purchase_date and loans.started_at are the same date in two
    -- places (the card reads the former, the loan tab the latter) — keep them
    -- in step.
    update public.customers set purchase_date = v_purchase where id = v_id;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- log_payment(p jsonb) -> uuid   (v2)
-- Now also stamps a unique, printable invoice number.
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
    signature, paid_at, recorded_by, branch_id, invoice_no
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
    caller.branch_id,
    'INV-' || lpad(nextval('public.payments_invoice_seq')::text, 6, '0')
  ) returning id into new_id;

  return new_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- payment_receipt(payment_id) -> jsonb   NEW
--
-- Everything the printed EMI receipt needs, in one call: branch letterhead,
-- customer, loan, the payment itself, and the paid / pending counts the client
-- specifically asked to see on the slip.
--
-- security invoker so the existing payments_read (own branch) and
-- payments_owner_read policies apply unchanged — no new RLS surface.
--
-- paid_count is "as of this payment", not as of today: reprinting receipt #2
-- after five payments must still read "Paid 2 of 12", because a receipt is a
-- historical document. Ties on paid_at are broken by id so the count is stable.
-- ----------------------------------------------------------------------------
create or replace function public.payment_receipt(p_payment_id uuid)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'branch', jsonb_build_object(
      'name',    br.name,
      'code',    br.code,
      'city',    br.city,
      'address', br.address,
      'phone',   br.phone
    ),
    'customer', jsonb_build_object(
      'id',            c.id,
      'account_no',    c.account_no,
      'name',          btrim(concat_ws(' ', c.first_name, c.middle_name, c.last_name)),
      'village',       c.address_village,
      'post',          c.address_post,
      'taluka',        c.address_taluka,
      'district',      c.address_district,
      'mobiles',       to_jsonb(c.mobiles),
      'model_no',      c.model_no,
      'purchase_date', c.purchase_date
    ),
    'loan', jsonb_build_object(
      'id',              l.id,
      'principal_paise', l.principal_paise,
      'emi_paise',       l.emi_paise,
      'tenure_months',   l.tenure_months,
      'first_emi_date',  coalesce(l.first_emi_date, (c.purchase_date + interval '1 month')::date),
      'due_day',         l.due_day
    ),
    'payment', jsonb_build_object(
      'id',            pm.id,
      'invoice_no',    pm.invoice_no,
      'receipt_no',    pm.receipt_no,
      'month_no',      pm.month_no,
      'amount_paise',  pm.amount_paise,
      'penalty_paise', pm.penalty_paise,
      'total_paise',   pm.amount_paise + pm.penalty_paise,
      'mode',          pm.mode,
      'signature',     pm.signature,
      'paid_at',       pm.paid_at
    ),
    'paid_count',    seq.n,
    'pending_count', greatest(l.tenure_months - seq.n, 0),
    'next_due_date', case
      when seq.n >= l.tenure_months then null
      else (coalesce(l.first_emi_date, (c.purchase_date + interval '1 month')::date)
            + make_interval(months => seq.n))::date
    end
  )
  from public.payments pm
  join public.loans l      on l.id = pm.loan_id
  join public.customers c  on c.id = l.customer_id
  left join public.branches br on br.id = pm.branch_id
  cross join lateral (
    select count(*)::int as n
      from public.payments p2
     where p2.loan_id = pm.loan_id
       and (p2.paid_at, p2.id) <= (pm.paid_at, pm.id)
  ) seq
  where pm.id = p_payment_id
    and c.deleted_at is null;
$$;

-- ----------------------------------------------------------------------------
-- customer_status_counts() -> (green, yellow, orange, red)
-- Re-anchored on the first-EMI date via installments_due(). Same return
-- signature, so `create or replace` is enough. security invoker: branch-scoped
-- RLS applies, so a staff member only ever counts their own branch.
-- ----------------------------------------------------------------------------
create or replace function public.customer_status_counts()
returns table (green int, yellow int, orange int, red int)
language sql stable security invoker set search_path = public as $$
  with b as (
    select greatest(
      public.installments_due(l.first_emi_date, c.purchase_date, l.tenure_months)
        - (select count(*) from public.payments pm where pm.loan_id = l.id),
      0) as behind
    from public.customers c
    join public.loans l on l.customer_id = c.id and l.status = 'active'
    where c.deleted_at is null
      and coalesce(l.first_emi_date, c.purchase_date) is not null
  )
  select
    count(*) filter (where behind = 0)::int,
    count(*) filter (where behind between 1 and 2)::int,
    count(*) filter (where behind = 3)::int,
    count(*) filter (where behind > 3)::int
  from b;
$$;

-- ----------------------------------------------------------------------------
-- owner_branch_stats() — same buckets, re-anchored on the first-EMI date.
-- Return signature unchanged, so no drop is needed this time.
-- ----------------------------------------------------------------------------
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
      count(*) filter (where per.behind = 0)             as green,
      count(*) filter (where per.behind between 1 and 2) as yellow,
      count(*) filter (where per.behind = 3)             as orange,
      count(*) filter (where per.behind > 3)             as red
    from (
      select greatest(
        public.installments_due(l.first_emi_date, c.purchase_date, l.tenure_months)
          - (select count(*) from public.payments pm where pm.loan_id = l.id),
        0) as behind
      from public.customers c
      join public.loans l on l.customer_id = c.id and l.status = 'active'
      where c.branch_id = b.id
        and c.deleted_at is null
        and coalesce(l.first_emi_date, c.purchase_date) is not null
    ) per
  ) sc on true
  order by b.created_at asc;
end;
$$;
