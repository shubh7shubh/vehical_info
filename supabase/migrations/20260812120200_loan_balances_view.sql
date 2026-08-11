-- Phase 4.9 (3/4) — Client feedback round 3: amount-based accounting.
--
-- Until now "installments paid" meant `select count(*) from payments` in five
-- separate places. Partial payments end that: two receipts of Rs 2,500 against a
-- Rs 5,000 EMI are one settled installment, not two.
--
-- The whole shift is one substitution, applied everywhere:
--
--     count(payments)  ->  installments_settled(emi, sum(amount_paise), tenure)
--
-- Every downstream formula keeps its exact current shape — behind is still
-- `greatest(due - paid, 0)`, pending is still `tenure - paid`, next_due is still
-- `first_emi + paid months`. That is deliberate: for any customer who has only
-- ever paid whole EMIs, settled == count exactly, so NO existing customer changes
-- reminder bucket when this deploys and the Phase 4.5 pgTAP assertions still hold.
--
-- A customer one rupee short of an EMI now reads as 1 behind rather than 0. That
-- is the correct answer, and it is the point of the exercise.

-- ============================================================================
-- SECTION 1 — public.loan_balances, the single read model
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Every consumer of loan money reads this view: the customer card, the payments
-- form, the printable statement, the reminder buckets, the owner rollup, and (in
-- the next slice) the foreclosure calculator. The arithmetic drifted last time
-- because it lived in five places; now it lives here.
--
-- security_invoker = on is what keeps CLAUDE.md's "RLS is mandatory" honest. The
-- view holds no policies of its own — it inherits loans_read / payments_read /
-- penalties_read and the matching *_owner_read policies, evaluated as the caller.
-- Inside owner_branch_stats (security definer) the invoker is the function owner,
-- so the owner still sees every branch exactly as it does today.
--
-- Column glossary, because three different "balances" are easy to confuse:
--   emi_overdue_paise    what is late RIGHT NOW  (due-by-today x EMI - collected)
--   emi_remaining_paise  what is left over the WHOLE loan (tenure x EMI - collected)
--   outstanding_paise    emi_overdue + penalty_balance   <- "what to collect today"
--   loan_balance_paise   emi_remaining + penalty_balance <- "total to close out"
-- Recordings 11/14 mean outstanding_paise by "outstanding due"; recording 12's
-- "total outstanding balance" on the receipt is loan_balance_paise.
-- ----------------------------------------------------------------------------
create or replace view public.loan_balances with (security_invoker = on) as
select
  l.id                                as loan_id,
  l.customer_id,
  l.branch_id,
  l.status,
  l.emi_paise,
  l.tenure_months,
  l.principal_paise,
  l.started_at,
  l.penalty_type,
  l.penalty_rate_paise,
  c.deleted_at                        as customer_deleted_at,
  fe.d                                as first_emi_date,

  pay.emi_collected_paise,
  pay.penalty_collected_paise,
  pen.penalty_charged_paise,

  d.n                                 as installments_due,
  s.n                                 as installments_settled,
  greatest(l.tenure_months - s.n, 0)  as installments_pending,
  greatest(d.n - s.n, 0)              as months_behind,

  greatest(d.n::bigint * l.emi_paise - pay.emi_collected_paise, 0)
                                      as emi_overdue_paise,
  greatest(l.tenure_months::bigint * l.emi_paise - pay.emi_collected_paise, 0)
                                      as emi_remaining_paise,
  greatest(pay.emi_collected_paise - l.tenure_months::bigint * l.emi_paise, 0)
                                      as advance_paise,
  greatest(pen.penalty_charged_paise - pay.penalty_collected_paise, 0)
                                      as penalty_balance_paise,

  public.pending_month_no(l.emi_paise, pay.emi_collected_paise, l.tenure_months)
                                      as pending_month_no,
  public.pending_month_shortfall(l.emi_paise, pay.emi_collected_paise, l.tenure_months)
                                      as pending_month_balance_paise,

  greatest(d.n::bigint * l.emi_paise - pay.emi_collected_paise, 0)
    + greatest(pen.penalty_charged_paise - pay.penalty_collected_paise, 0)
                                      as outstanding_paise,
  greatest(l.tenure_months::bigint * l.emi_paise - pay.emi_collected_paise, 0)
    + greatest(pen.penalty_charged_paise - pay.penalty_collected_paise, 0)
                                      as loan_balance_paise,

  case when s.n >= l.tenure_months then null
       else (fe.d + make_interval(months => s.n))::date
  end                                 as next_due_date

from public.loans l
join public.customers c on c.id = l.customer_id
cross join lateral (
  select coalesce(l.first_emi_date, (c.purchase_date + interval '1 month')::date) as d
) fe
cross join lateral (
  -- sum(bigint) is numeric in Postgres; cast back so every downstream
  -- comparison and helper call stays in bigint.
  select coalesce(sum(p.amount_paise), 0)::bigint  as emi_collected_paise,
         coalesce(sum(p.penalty_paise), 0)::bigint as penalty_collected_paise
    from public.payments p
   where p.loan_id = l.id
     and p.deleted_at is null
) pay
cross join lateral (
  select coalesce(sum(pn.amount_paise), 0)::bigint as penalty_charged_paise
    from public.penalties pn
   where pn.loan_id = l.id
     and pn.waived_at is null
) pen
cross join lateral (
  select public.installments_due(l.first_emi_date, c.purchase_date, l.tenure_months) as n
) d
cross join lateral (
  select public.installments_settled(l.emi_paise, pay.emi_collected_paise, l.tenure_months) as n
) s;

comment on view public.loan_balances is
  'Single source of truth for per-loan money (client feedback round 3). '
  'security_invoker = on, so branch RLS on loans/payments/penalties applies to '
  'the caller unchanged and the view adds no new RLS surface. Mirrored by '
  'lib/loan-status.ts — change both together.';

revoke all on public.loan_balances from anon;
grant select on public.loan_balances to authenticated;

-- ============================================================================
-- SECTION 2 — the reminder buckets, re-pointed at the view
-- ============================================================================

-- ----------------------------------------------------------------------------
-- customer_status_counts() — same signature, same 0 / 1-2 / 3 / >3 buckets.
-- Only the source of `behind` changes.
-- ----------------------------------------------------------------------------
create or replace function public.customer_status_counts()
returns table (green int, yellow int, orange int, red int)
language sql stable security invoker set search_path = public as $$
  select
    count(*) filter (where months_behind = 0)::int,
    count(*) filter (where months_behind between 1 and 2)::int,
    count(*) filter (where months_behind = 3)::int,
    count(*) filter (where months_behind > 3)::int
  from public.loan_balances
  where status = 'active'
    and customer_deleted_at is null
    and first_emi_date is not null;
$$;

-- ----------------------------------------------------------------------------
-- owner_branch_stats() — the per-branch rollup. Return signature unchanged, so
-- create or replace is enough (no drop). The inner behind subquery is replaced
-- by a read of the view.
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
      count(*) filter (where lb.months_behind = 0)             as green,
      count(*) filter (where lb.months_behind between 1 and 2) as yellow,
      count(*) filter (where lb.months_behind = 3)             as orange,
      count(*) filter (where lb.months_behind > 3)             as red
    from public.loan_balances lb
    where lb.branch_id = b.id
      and lb.status = 'active'
      and lb.customer_deleted_at is null
      and lb.first_emi_date is not null
  ) sc on true
  order by b.created_at asc;
end;
$$;

-- ============================================================================
-- SECTION 3 — update_customer, tenure guard on settled installments
-- ============================================================================

-- ----------------------------------------------------------------------------
-- update_customer(p jsonb) -> uuid   (v2)
--
-- Only the tenure guard changes. It used to count payment rows, which with
-- partial payments would refuse a perfectly legal edit (four Rs 1,250 receipts on
-- a Rs 5,000 EMI are one installment, not four).
--
-- Two corrections: it counts settled installments, and it evaluates them against
-- the NEW emi_paise from the form — otherwise lowering the EMI could silently
-- push the settled count past the tenure. ceil() rather than floor(), because a
-- part-paid month is already an installment on the books and the tenure must
-- still have room for it.
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
  v_emi bigint;
  v_collected bigint;
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
    v_emi := coalesce(
      nullif(p->'loan'->>'emi_paise', '')::bigint,
      v_loan.emi_paise
    );

    -- Shortening the tenure below what has already been collected would make the
    -- ledger unreadable ("Paid 8 of 6"). Measured against the NEW EMI, and
    -- rounded up, because a part-paid month still occupies an installment slot.
    select coalesce(sum(amount_paise), 0) into v_collected
      from public.payments
     where loan_id = v_loan.id and deleted_at is null;
    v_paid := case when v_emi > 0
                   then ceil(v_collected::numeric / v_emi)::int
                   else 0 end;
    if v_tenure < v_paid then
      raise exception 'Tenure cannot be less than the % installments already recorded', v_paid;
    end if;

    update public.loans set
      principal_paise = coalesce(nullif(p->'loan'->>'principal_paise', '')::bigint,
                                 v_loan.principal_paise),
      emi_paise       = v_emi,
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
