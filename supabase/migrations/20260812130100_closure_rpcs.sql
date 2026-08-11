-- Phase 4.95 (2/2) — Client feedback round 3, slice B: the closure RPCs.
--
-- Every write here is branch-scoped through caller.branch_id even though the
-- functions are security definer, exactly as log_payment and update_customer are.

-- ============================================================================
-- SECTION 1 — the foreclosure quote (recordings 5 and 6)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- calculate_foreclosure(loan, bank_charge, interest_waiver) -> jsonb
--
-- Read-only preview. security invoker, so branch RLS on loans / loan_balances
-- applies to the caller and the owner can still see every branch read-only.
--
-- THE SIX-MONTH RULE (recording 5): eligible once six whole months have passed
-- from loans.started_at. Reported here so the button can be disabled with a
-- reason; re-checked in record_foreclosure, because a disabled button is not a
-- security control.
--
-- THE MONEY. `loans` has no interest column, but interest is derivable:
--
--   total_interest     = emi x tenure - principal
--   remaining_interest = total_interest x remaining_months / tenure   (straight-line)
--   final_payable      = greatest(emi_outstanding - interest_waived, 0)
--                        + bank_charge + penalty_balance
--
-- Straight-line rather than rule-of-78 because it can be explained across a
-- counter, and because PRD §3.7's worked example is plain subtraction.
--
-- The two judgement calls stay with the operator: `interest_waiver` defaults to
-- the full remaining interest but is editable, and `bank_charge` defaults to
-- Rs 1,000 (PRD §3.7). Note that PRD table is internally inconsistent — it shows
-- "Rs 6,000 - Rs 1,000 = Rs 5,000" as the payable, which actually describes the
-- customer's *saving*, not what they hand over. Both numbers are returned
-- separately so the screen can label them and the confusion cannot survive.
-- ----------------------------------------------------------------------------
create or replace function public.calculate_foreclosure(
  p_loan_id               uuid,
  p_bank_charge_paise     bigint default null,
  p_interest_waiver_paise bigint default null
) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  l               public.loans;
  lb              public.loan_balances;
  v_months        int;
  v_remaining     int;
  v_total_int     bigint;
  v_remaining_int bigint;
  v_waiver        bigint;
  v_charge        bigint;
  v_payable       bigint;
begin
  select * into l from public.loans where id = p_loan_id;
  if l.id is null then
    raise exception 'Loan not found';
  end if;

  select * into lb from public.loan_balances where loan_id = p_loan_id;

  v_months    := public.months_elapsed(l.started_at, current_date);
  v_remaining := greatest(l.tenure_months - coalesce(lb.installments_settled, 0), 0);

  v_total_int     := greatest(l.tenure_months::bigint * l.emi_paise - l.principal_paise, 0);
  v_remaining_int := case
    when l.tenure_months > 0
      then round(v_total_int::numeric * v_remaining / l.tenure_months)::bigint
    else 0
  end;

  v_waiver  := greatest(coalesce(p_interest_waiver_paise, v_remaining_int), 0);
  v_charge  := greatest(coalesce(p_bank_charge_paise, 100000), 0);   -- Rs 1,000
  v_payable := greatest(coalesce(lb.emi_remaining_paise, 0) - v_waiver, 0)
                 + v_charge
                 + coalesce(lb.penalty_balance_paise, 0);

  return jsonb_build_object(
    'loan_id',                  l.id,
    'eligible',                 v_months >= 6,
    'eligible_from',            (l.started_at + interval '6 months')::date,
    'months_elapsed',           v_months,
    'started_at',               l.started_at,
    'tenure_months',            l.tenure_months,
    'remaining_months',         v_remaining,
    'installments_settled',     coalesce(lb.installments_settled, 0),
    'principal_paise',          l.principal_paise,
    'emi_paise',                l.emi_paise,
    'emi_collected_paise',      coalesce(lb.emi_collected_paise, 0),
    'emi_outstanding_paise',    coalesce(lb.emi_remaining_paise, 0),
    'emi_overdue_paise',        coalesce(lb.emi_overdue_paise, 0),
    'penalty_balance_paise',    coalesce(lb.penalty_balance_paise, 0),
    'total_interest_paise',     v_total_int,
    'remaining_interest_paise', v_remaining_int,
    'interest_waived_paise',    v_waiver,
    'bank_charge_paise',        v_charge,
    'final_payable_paise',      v_payable,
    -- What the customer saves by closing early. This is the figure PRD §3.7's
    -- example actually describes; kept apart from final_payable on purpose.
    'customer_saving_paise',    v_waiver - v_charge,
    'status',                   l.status
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- record_foreclosure(p jsonb) -> uuid
--
-- Admin only (PRD §5: "Process foreclosure — Admin only, Employee view only").
-- Re-runs calculate_foreclosure server-side and snapshots every line, so the
-- quote the customer was handed is reconstructable later.
--
-- Input: { loan_id, bank_charge_paise?, interest_waiver_paise?, notes? }
-- ----------------------------------------------------------------------------
create or replace function public.record_foreclosure(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  l      public.loans;
  q      jsonb;
  v_id   uuid;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role <> 'admin' then
    raise exception 'Only an admin can record a foreclosure';
  end if;
  if caller.branch_id is null then
    raise exception 'Your account is not assigned to a branch';
  end if;

  select * into l from public.loans
   where id = nullif(p->>'loan_id', '')::uuid
     and branch_id = caller.branch_id;
  if l.id is null then
    raise exception 'Loan not found in your branch';
  end if;
  if l.status <> 'active' then
    raise exception 'This loan is already closed';
  end if;

  -- Recording 5, enforced server-side. The disabled button is a courtesy; this
  -- is the control.
  if public.months_elapsed(l.started_at, current_date) < 6 then
    raise exception 'Foreclosure is only allowed after six months — this loan is eligible from %',
      to_char((l.started_at + interval '6 months')::date, 'DD-MM-YYYY');
  end if;

  if exists (select 1 from public.foreclosures
              where loan_id = l.id and paid_at is null) then
    raise exception 'This loan already has an unpaid foreclosure quote';
  end if;

  q := public.calculate_foreclosure(
         l.id,
         nullif(p->>'bank_charge_paise', '')::bigint,
         nullif(p->>'interest_waiver_paise', '')::bigint
       );

  insert into public.foreclosures (
    loan_id, original_interest_paise, interest_waived_paise, bank_charge_paise,
    emi_outstanding_paise, penalty_balance_paise, remaining_months,
    final_payable_paise, notes, created_by, branch_id
  ) values (
    l.id,
    (q->>'remaining_interest_paise')::bigint,
    (q->>'interest_waived_paise')::bigint,
    (q->>'bank_charge_paise')::bigint,
    (q->>'emi_outstanding_paise')::bigint,
    (q->>'penalty_balance_paise')::bigint,
    (q->>'remaining_months')::int,
    (q->>'final_payable_paise')::bigint,
    nullif(btrim(p->>'notes'), ''),
    auth.uid(),
    l.branch_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- settle_foreclosure(p jsonb) -> uuid
--
-- Marks the quote paid and closes the loan. Admin only.
-- Input: { foreclosure_id, paid_at?, noc_issued?, notes? }
-- ----------------------------------------------------------------------------
create or replace function public.settle_foreclosure(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  f      public.foreclosures;
  v_paid timestamptz;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role <> 'admin' then
    raise exception 'Only an admin can settle a foreclosure';
  end if;

  select * into f from public.foreclosures
   where id = nullif(p->>'foreclosure_id', '')::uuid
     and branch_id = caller.branch_id;
  if f.id is null then
    raise exception 'Foreclosure not found in your branch';
  end if;

  v_paid := coalesce(nullif(p->>'paid_at', '')::timestamptz, now());

  update public.foreclosures set
    paid_at       = v_paid,
    noc_issued_at = case
                      when (p->>'noc_issued')::boolean is true
                        then coalesce(noc_issued_at, v_paid)
                      else noc_issued_at
                    end,
    notes         = coalesce(nullif(btrim(p->>'notes'), ''), notes)
  where id = f.id;

  -- The loan is done. status 'foreclosed' has existed in the loan_status enum
  -- since the Phase 2 schema.
  update public.loans
     set status = 'foreclosed', closed_at = v_paid::date
   where id = f.loan_id;

  return f.id;
end;
$$;

-- ============================================================================
-- SECTION 2 — seizure (recordings 7, 8, 9)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- record_seizure(p jsonb) -> uuid
--
-- An employee may create one; it lands 'pending' for an admin to approve, which
-- is what the existing seizures_employee_insert / seizures_admin_update policies
-- and PRD §3.6 already describe. An admin creating one may approve it inline.
--
-- Input: { customer_id, amount_paise, notes?, approve? }
-- ----------------------------------------------------------------------------
create or replace function public.record_seizure(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller   public.users;
  c        public.customers;
  l        public.loans;
  v_amount bigint;
  v_status seizure_status;
  v_id     uuid;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role not in ('admin', 'employee') then
    raise exception 'Your role cannot record a seizure';
  end if;
  if caller.branch_id is null then
    raise exception 'Your account is not assigned to a branch';
  end if;

  select * into c from public.customers
   where id = nullif(p->>'customer_id', '')::uuid
     and branch_id = caller.branch_id
     and deleted_at is null;
  if c.id is null then
    raise exception 'Customer not found in your branch';
  end if;

  select * into l from public.loans
   where customer_id = c.id and branch_id = caller.branch_id and status = 'active'
   order by started_at desc
   limit 1;
  if l.id is null then
    raise exception 'No active loan found for this customer in your branch';
  end if;

  if exists (select 1 from public.seizures
              where customer_id = c.id and status in ('pending', 'active')) then
    raise exception 'This customer is already under seizure';
  end if;

  -- PRD §3.6: the amount is variable per case (effort, expenses), so it is
  -- entered, not derived.
  v_amount := coalesce(nullif(p->>'amount_paise', '')::bigint, 0);
  if v_amount < 0 then
    raise exception 'A seizure amount cannot be negative';
  end if;

  v_status := case
    when caller.role = 'admin' and (p->>'approve')::boolean is true then 'active'
    else 'pending'
  end;

  insert into public.seizures (
    customer_id, loan_id, amount_paise, notes, status,
    created_by, approved_by, approved_at, branch_id
  ) values (
    c.id, l.id, v_amount,
    nullif(btrim(p->>'notes'), ''),
    v_status,
    auth.uid(),
    case when v_status = 'active' then auth.uid() end,
    case when v_status = 'active' then now() end,
    c.branch_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- approve_seizure(p jsonb) -> uuid
--
-- pending -> active. Admin only (PRD §3.6: "Admin must approve the final seizure
-- charge amount"). The amount may be corrected at approval time, which is the
-- whole point of the approval step.
--
-- Input: { seizure_id, amount_paise?, notes? }
-- ----------------------------------------------------------------------------
create or replace function public.approve_seizure(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  s      public.seizures;
  v_amt  bigint;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role <> 'admin' then
    raise exception 'Only an admin can approve a seizure';
  end if;

  select * into s from public.seizures
   where id = nullif(p->>'seizure_id', '')::uuid
     and branch_id = caller.branch_id;
  if s.id is null then
    raise exception 'Seizure not found in your branch';
  end if;
  if s.status <> 'pending' then
    raise exception 'Only a pending seizure can be approved';
  end if;

  v_amt := nullif(p->>'amount_paise', '')::bigint;
  if v_amt is not null and v_amt < 0 then
    raise exception 'A seizure amount cannot be negative';
  end if;

  update public.seizures set
    status       = 'active',
    amount_paise = coalesce(v_amt, amount_paise),
    notes        = coalesce(nullif(btrim(p->>'notes'), ''), notes),
    approved_by  = auth.uid(),
    approved_at  = now()
  where id = s.id;

  return s.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- exit_seizure(p jsonb) -> uuid
--
-- Recording 8: "when a seized customer clears the loan by paying all the pending
-- amounts — all outstanding dues, all penalties, the complete foreclosure amount
-- — the customer should be removed from the Seizing status."
--
-- Recording 9: "only the Owner and Admin should have permission". Ships ADMIN
-- ONLY, for the same reason as set_penalty_charge — the owner is read-only at the
-- DB layer and has no branch to write into. The role the client is excluding is
-- employee, and this delivers that. See 20260812120100_penalty_ledger.sql.
--
-- The guard checks ARREARS, not the whole loan balance. A customer who has
-- caught up mid-tenure gets the vehicle back; demanding the entire remaining
-- loan would mean nobody is ever released, which is not what the client
-- described and not what happens in practice. The "complete foreclosure amount"
-- clause is covered by the unpaid-quote check.
--
-- Input: { seizure_id, exit_reason? }
-- ----------------------------------------------------------------------------
create or replace function public.exit_seizure(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  s      public.seizures;
  lb     public.loan_balances;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role <> 'admin' then
    raise exception 'Only an admin can remove a customer from seizing';
  end if;

  select * into s from public.seizures
   where id = nullif(p->>'seizure_id', '')::uuid
     and branch_id = caller.branch_id;
  if s.id is null then
    raise exception 'Seizure not found in your branch';
  end if;
  if s.status not in ('pending', 'active') then
    raise exception 'This seizure has already been closed';
  end if;

  -- Bring the penalty ledger up to date first, so "all penalties cleared" is
  -- judged against every month that has fallen due, not a stale figure.
  if s.loan_id is not null then
    perform public.accrue_penalties(s.loan_id);
    select * into lb from public.loan_balances where loan_id = s.loan_id;
  end if;

  -- `%` is the RAISE placeholder; `%s` would print a stray "s".
  if coalesce(lb.emi_overdue_paise, 0) > 0 then
    raise exception 'EMI arrears of Rs % are still outstanding',
      to_char(lb.emi_overdue_paise / 100.0, 'FM999999990.00');
  end if;
  if coalesce(lb.penalty_balance_paise, 0) > 0 then
    raise exception 'A penalty of Rs % is still outstanding',
      to_char(lb.penalty_balance_paise / 100.0, 'FM999999990.00');
  end if;
  if s.loan_id is not null and exists (
       select 1 from public.foreclosures
        where loan_id = s.loan_id and paid_at is null
     ) then
    raise exception 'The recorded foreclosure amount has not been paid';
  end if;

  update public.seizures set
    status      = 'resolved',
    exited_at   = now(),
    exited_by   = auth.uid(),
    exit_reason = nullif(btrim(p->>'exit_reason'), '')
  where id = s.id;

  return s.id;
end;
$$;

-- ============================================================================
-- SECTION 3 — the lookup behind the page (recordings 4 and 7)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- closure_lookup(p_customer_id uuid) -> jsonb
--
-- Everything the Foreclosure & Seizing screen needs for one customer, in one
-- call: identity, vehicle, the loan, its balances, the foreclosure quote and any
-- seizure on record.
--
-- On "loan number": there is no such column. customers.account_no is the number
-- the branch actually writes in the book and searches by, and search_customers()
-- already matches it — so the page searches with that and passes the id here.
-- Inventing loans.loan_no would hand the client an identifier that does not
-- exist in their records.
--
-- security invoker: branch RLS does the scoping, and the owner reads every
-- branch without being able to write.
-- ----------------------------------------------------------------------------
create or replace function public.closure_lookup(p_customer_id uuid)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  c  public.customers;
  l  public.loans;
  lb public.loan_balances;
begin
  select * into c from public.customers
   where id = p_customer_id and deleted_at is null;
  if c.id is null then
    return null;
  end if;

  select * into l from public.loans
   where customer_id = c.id
   order by (status = 'active') desc, started_at desc
   limit 1;

  if l.id is not null then
    select * into lb from public.loan_balances where loan_id = l.id;
  end if;

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id',         c.id,
      'account_no', c.account_no,
      'name',       btrim(concat_ws(' ', c.first_name, c.middle_name, c.last_name)),
      'village',    c.address_village,
      'taluka',     c.address_taluka,
      'district',   c.address_district,
      'mobiles',    to_jsonb(c.mobiles),
      'model_no',   c.model_no
    ),
    'vehicle', (
      select jsonb_build_object('vehicle_name', v.vehicle_name, 'rc_no', v.rc_no,
                                'engine_no_1', v.engine_no_1, 'chassis_no', v.chassis_no)
        from public.vehicles v where v.customer_id = c.id limit 1
    ),
    'loan', case when l.id is null then null else jsonb_build_object(
      'id',              l.id,
      'principal_paise', l.principal_paise,
      'emi_paise',       l.emi_paise,
      'tenure_months',   l.tenure_months,
      'started_at',      l.started_at,
      'first_emi_date',  coalesce(l.first_emi_date, (c.purchase_date + interval '1 month')::date),
      'status',          l.status
    ) end,
    'balances', case when l.id is null then null else jsonb_build_object(
      'installments_settled',  lb.installments_settled,
      'installments_pending',  lb.installments_pending,
      'months_behind',         lb.months_behind,
      'emi_overdue_paise',     lb.emi_overdue_paise,
      'emi_remaining_paise',   lb.emi_remaining_paise,
      'penalty_balance_paise', lb.penalty_balance_paise,
      'outstanding_paise',     lb.outstanding_paise,
      'loan_balance_paise',    lb.loan_balance_paise,
      'pending_month_no',      lb.pending_month_no,
      'next_due_date',         lb.next_due_date
    ) end,
    'foreclosure_quote', case when l.id is null then null
      else public.calculate_foreclosure(l.id) end,
    'foreclosures', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.calculated_at desc)
        from public.foreclosures f where f.loan_id = l.id
    ), '[]'::jsonb),
    'seizures', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
        from public.seizures s where s.customer_id = c.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- seized_customers() -> table
--
-- The "currently seized" list for the branch. security invoker, so an employee
-- sees their branch and the owner sees every branch.
-- ----------------------------------------------------------------------------
create or replace function public.seized_customers()
returns table (
  seizure_id     uuid,
  customer_id    uuid,
  account_no     text,
  name           text,
  status         seizure_status,
  amount_paise   bigint,
  created_at     timestamptz,
  days_held      int,
  outstanding_paise bigint
)
language sql stable security invoker set search_path = public as $$
  select
    s.id,
    c.id,
    c.account_no,
    btrim(concat_ws(' ', c.first_name, c.middle_name, c.last_name)),
    s.status,
    s.amount_paise,
    s.created_at,
    greatest((current_date - s.created_at::date), 0)::int,
    coalesce(lb.outstanding_paise, 0)
  from public.seizures s
  join public.customers c on c.id = s.customer_id
  left join public.loan_balances lb on lb.loan_id = s.loan_id
  where s.status in ('pending', 'active')
    and c.deleted_at is null
  order by s.created_at desc;
$$;
