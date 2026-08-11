-- Phase 4.9 (4/4) — Client feedback round 3: the payment write and read paths.
--
--   log_payment      v3  accepts a short EMI and a penalty-only receipt
--   payment_receipt  v2  returns the full breakdown the client dictated
--   amend_payment    new admin-only correction of a recorded receipt
--   void_payment     new admin-only soft delete of a mis-keyed receipt

-- ============================================================================
-- SECTION 1 — log_payment v3
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Three changes from v2:
--
--   1. The `installment_paise <= 0` guard becomes "neither amount is negative,
--      and at least one of them is positive". That is what makes recording 13's
--      penalty-only receipt possible; the payments_amount_or_penalty CHECK is the
--      backstop if anything ever writes around this RPC.
--   2. Penalties are accrued before the insert, so the balance printed on the
--      receipt is current rather than one collection behind.
--   3. month_no defaults to the installment the money is actually landing on
--      (pending_month_no computed BEFORE this payment), not to a row count the
--      operator has to work out.
--
-- accrue_penalties is called with current_date, deliberately NOT with paid_at: a
-- back-dated receipt must not un-charge months that have since fallen due.
-- ----------------------------------------------------------------------------
create or replace function public.log_payment(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller       public.users;
  v_customer   uuid;
  v_loan       public.loans;
  v_installment bigint;
  v_penalty    bigint;
  v_collected  bigint;
  v_month      int;
  new_id       uuid;
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

  v_installment := coalesce(nullif(p->>'installment_paise', '')::bigint, 0);
  v_penalty     := coalesce(nullif(p->>'penalty_paise', '')::bigint, 0);

  if v_installment < 0 or v_penalty < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  if v_installment + v_penalty <= 0 then
    raise exception 'Enter an installment amount, a penalty amount, or both';
  end if;

  -- Bring the penalty ledger up to date first, so penalty_balance on the receipt
  -- reflects every month that has fallen due — including ones this payment is
  -- about to settle.
  perform public.accrue_penalties(v_loan.id);

  -- Which installment is this money landing on? Answered from the running total
  -- as it stood BEFORE this receipt.
  if nullif(p->>'month_no', '') is null then
    select coalesce(sum(amount_paise), 0) into v_collected
      from public.payments
     where loan_id = v_loan.id and deleted_at is null;
    v_month := public.pending_month_no(v_loan.emi_paise, v_collected, v_loan.tenure_months);
  else
    v_month := (p->>'month_no')::int;
  end if;

  insert into public.payments (
    loan_id, amount_paise, penalty_paise, mode, month_no, receipt_no,
    remark, signature, paid_at, recorded_by, branch_id, invoice_no
  ) values (
    v_loan.id,
    v_installment,
    v_penalty,
    coalesce(nullif(p->>'mode', '')::payment_mode, 'cash'),
    v_month,
    nullif(btrim(p->>'receipt_no'), ''),
    nullif(btrim(p->>'remark'), ''),
    coalesce((p->>'signature')::boolean, false),
    coalesce(nullif(p->>'paid_at', '')::timestamptz, now()),
    auth.uid(),
    caller.branch_id,
    'INV-' || lpad(nextval('public.payments_invoice_seq')::text, 6, '0')
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- ============================================================================
-- SECTION 2 — payment_receipt v2
-- ============================================================================

-- ----------------------------------------------------------------------------
-- payment_receipt(p_payment_id uuid) -> jsonb   (v2)
--
-- Recordings 1, 11, 12, 14 and 15 all land here — the slip has to show the EMI
-- paid today, what is still short on that EMI and against which month, the
-- penalty paid today, the penalty still owed, the total taken today, and the
-- overall balance.
--
-- THE INVARIANT THAT MUST SURVIVE: a receipt is a historical document. Reprinting
-- receipt #2 after five more collections must reproduce receipt #2 exactly. Every
-- aggregate below is therefore bounded by an as-of window on (paid_at, …) <= this
-- payment.
--
-- The tie-break is invoice_no, not id. paid_at comes from a date input, so every
-- receipt taken on the same day carries the identical midnight timestamp — and
-- v1's `(paid_at, id)` then fell back to comparing random UUIDs, which put
-- same-day receipts in an arbitrary order and made "total paid today" wrong.
-- invoice_no is stamped from a sequence and zero-padded, so ordering by it is
-- insertion order, and it is stable even for rows written inside one transaction
-- (where created_at would be identical). Raw-seeded rows have no invoice_no, so
-- coalesce keeps them ahead of stamped ones rather than dropping them.
--
-- The penalty side needs a different bound, because charge rows are written by an
-- engine that may run long after the fact. Bounding on period_end (when the
-- charge became due) rather than created_at (when the row happened to be
-- inserted) keeps a late accrual landing on the correct side of history, and
-- `waived_at > pm.paid_at` stops tomorrow's waiver from rewriting yesterday's slip.
--
-- security invoker, so payments_read / payments_owner_read still apply unchanged.
--
-- paid_count is now settled installments rather than a row count. For every
-- receipt printed before this migration the two are identical (each payment was
-- one whole EMI), so no already-issued slip changes.
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
      'first_emi_date',  fe.d,
      'due_day',         l.due_day,
      'started_at',      l.started_at
    ),
    'payment', jsonb_build_object(
      'id',            pm.id,
      'invoice_no',    pm.invoice_no,
      'receipt_no',    pm.receipt_no,
      'remark',        pm.remark,
      'month_no',      coalesce(pm.month_no, a.pending_month_no),
      'amount_paise',  pm.amount_paise,
      'penalty_paise', pm.penalty_paise,
      'total_paise',   pm.amount_paise + pm.penalty_paise,
      'mode',          pm.mode,
      'signature',     pm.signature,
      'paid_at',       pm.paid_at,
      'kind',          case
                         when pm.amount_paise = 0 and pm.penalty_paise > 0 then 'penalty'
                         when pm.penalty_paise = 0 then 'emi'
                         else 'emi_penalty'
                       end
    ),

    -- ---- everything below is AS OF this payment (recordings 11, 12, 14, 15) ----
    'emi_paid_today_paise',        a.emi_today,
    'penalty_paid_today_paise',    a.penalty_today,
    'total_paid_today_paise',      a.emi_today + a.penalty_today,
    'emi_collected_paise',         a.emi_collected,
    'emi_overdue_paise',           a.emi_overdue,
    'pending_month_no',            a.pending_month_no,
    'pending_month_balance_paise', a.pending_shortfall,
    'penalty_charged_paise',       a.penalty_charged,
    'penalty_collected_paise',     a.penalty_collected,
    'penalty_balance_paise',       greatest(a.penalty_charged - a.penalty_collected, 0),
    'advance_paise',
      greatest(a.emi_collected - l.tenure_months::bigint * l.emi_paise, 0),
    'outstanding_paise',
      a.emi_overdue + greatest(a.penalty_charged - a.penalty_collected, 0),
    'loan_balance_paise',
      greatest(l.tenure_months::bigint * l.emi_paise - a.emi_collected, 0)
        + greatest(a.penalty_charged - a.penalty_collected, 0),

    'paid_count',    a.settled,
    'pending_count', greatest(l.tenure_months - a.settled, 0),
    'next_due_date', case
      when a.settled >= l.tenure_months then null
      else (fe.d + make_interval(months => a.settled))::date
    end
  )
  from public.payments pm
  join public.loans l      on l.id = pm.loan_id
  join public.customers c  on c.id = l.customer_id
  left join public.branches br on br.id = pm.branch_id
  cross join lateral (
    select coalesce(l.first_emi_date, (c.purchase_date + interval '1 month')::date) as d
  ) fe
  cross join lateral (
    -- sum(bigint) is numeric; cast back so the helper calls below resolve.
    select
      coalesce(sum(p2.amount_paise), 0)::bigint  as emi_collected,
      coalesce(sum(p2.penalty_paise), 0)::bigint as penalty_collected,
      coalesce(sum(p2.amount_paise) filter (
        where public.ist_date(p2.paid_at) = public.ist_date(pm.paid_at)), 0)::bigint as emi_today,
      coalesce(sum(p2.penalty_paise) filter (
        where public.ist_date(p2.paid_at) = public.ist_date(pm.paid_at)), 0)::bigint as penalty_today
    from public.payments p2
    where p2.loan_id = pm.loan_id
      and p2.deleted_at is null
      and (p2.paid_at, coalesce(p2.invoice_no, ''), p2.id)
          <= (pm.paid_at, coalesce(pm.invoice_no, ''), pm.id)
  ) s
  cross join lateral (
    select coalesce(sum(pn.amount_paise), 0)::bigint as charged
      from public.penalties pn
     where pn.loan_id = pm.loan_id
       and pn.period_end <= public.ist_date(pm.paid_at)
       and (pn.waived_at is null or pn.waived_at > pm.paid_at)
  ) pen
  cross join lateral (
    select
      s.emi_collected,
      s.penalty_collected,
      s.emi_today,
      s.penalty_today,
      pen.charged as penalty_charged,
      public.installments_settled(l.emi_paise, s.emi_collected, l.tenure_months) as settled,
      greatest(
        public.installments_due(l.first_emi_date, c.purchase_date, l.tenure_months,
                                public.ist_date(pm.paid_at))::bigint * l.emi_paise
        - s.emi_collected, 0) as emi_overdue,
      public.pending_month_no(l.emi_paise, s.emi_collected, l.tenure_months)
        as pending_month_no,
      public.pending_month_shortfall(l.emi_paise, s.emi_collected, l.tenure_months)
        as pending_shortfall
  ) a
  where pm.id = p_payment_id
    and c.deleted_at is null;
$$;

-- ============================================================================
-- SECTION 3 — correcting a recorded receipt (recording 13)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- amend_payment(p jsonb) -> uuid
--
-- Recording 13: "Once this payment data has been recorded, only the Owner and
-- Admin should be allowed to make changes to it. Employees should not be able to
-- edit the recorded payment information."
--
-- ADMIN ONLY, for the same reason as set_penalty_charge: the owner is read-only
-- at the DB layer, and `employee` is the role the client is excluding. See the
-- comment on set_penalty_charge in 20260812120100_penalty_ledger.sql.
--
-- The invoice number is never reassigned — the customer is holding a slip with
-- that number on it. payments_audit records the before and after.
-- ----------------------------------------------------------------------------
create or replace function public.amend_payment(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  v_row  public.payments;
  v_id   uuid;
  v_amt  bigint;
  v_pen  bigint;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role <> 'admin' then
    raise exception 'Only an admin can change a recorded payment';
  end if;
  if caller.branch_id is null then
    raise exception 'Your account is not assigned to a branch';
  end if;

  v_id := nullif(p->>'payment_id', '')::uuid;
  select * into v_row from public.payments
   where id = v_id and branch_id = caller.branch_id and deleted_at is null;
  if v_row.id is null then
    raise exception 'Payment not found in your branch';
  end if;

  v_amt := coalesce(nullif(p->>'installment_paise', '')::bigint, v_row.amount_paise);
  v_pen := coalesce(nullif(p->>'penalty_paise', '')::bigint, v_row.penalty_paise);

  if v_amt < 0 or v_pen < 0 then
    raise exception 'Amounts cannot be negative';
  end if;
  if v_amt + v_pen <= 0 then
    raise exception 'A receipt must be for an installment amount, a penalty amount, or both';
  end if;

  update public.payments set
    amount_paise  = v_amt,
    penalty_paise = v_pen,
    mode          = coalesce(nullif(p->>'mode', '')::payment_mode, mode),
    month_no      = coalesce(nullif(p->>'month_no', '')::int, month_no),
    receipt_no    = coalesce(nullif(btrim(p->>'receipt_no'), ''), receipt_no),
    remark        = coalesce(nullif(btrim(p->>'remark'), ''), remark),
    signature     = coalesce((p->>'signature')::boolean, signature),
    paid_at       = coalesce(nullif(p->>'paid_at', '')::timestamptz, paid_at)
  where id = v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- void_payment(p jsonb) -> uuid
--
-- Soft delete for a mis-keyed receipt. CLAUDE.md is soft-delete-only, so the row
-- stays and every aggregate filters it out via `deleted_at is null`. Admin only.
-- ----------------------------------------------------------------------------
create or replace function public.void_payment(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  v_row  public.payments;
  v_id   uuid;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role <> 'admin' then
    raise exception 'Only an admin can void a payment';
  end if;
  if caller.branch_id is null then
    raise exception 'Your account is not assigned to a branch';
  end if;

  v_id := nullif(p->>'payment_id', '')::uuid;
  select * into v_row from public.payments
   where id = v_id and branch_id = caller.branch_id and deleted_at is null;
  if v_row.id is null then
    raise exception 'Payment not found in your branch';
  end if;

  update public.payments
     set deleted_at = now(),
         remark = coalesce(
           nullif(btrim(p->>'reason'), ''),
           remark
         )
   where id = v_id;

  return v_id;
end;
$$;
