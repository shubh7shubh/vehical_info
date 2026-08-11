-- Phase 4.9 (2/4) — Client feedback round 3: the penalty ledger.
--
-- Recordings 11, 13 and 15 all ask for a "remaining penalty balance". Today that
-- number cannot be computed at all: payments.penalty_paise records penalty
-- *collected*, and nothing anywhere records penalty *charged*.
--
-- The obvious shortcut — charged = months_behind x Rs 500 — is wrong, because
-- months_behind shrinks as the customer catches up. A customer who was five
-- months late and then paid everything would owe Rs 0 in penalties, silently
-- forgiving Rs 2,500 that was genuinely charged. Penalty has to be a ledger.
--
-- public.penalties has existed since the Phase 2 schema and has never had a
-- single reader or writer. It already carries branch_id, the set_branch_id arm,
-- the audit trigger, the updated_at trigger and branch-scoped RLS, so reviving it
-- satisfies the CLAUDE.md new-table checklist for free.
--
-- This is the deferred "Phase 4.9 automatic penalty accrual" engine. It is driven
-- lazily here; pointing pg_cron at accrue_penalties_all() later adds no new logic.

-- ============================================================================
-- SECTION 1 — scalar helpers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ist_date(timestamptz) -> date
--
-- Every "today" in this system is an Indian calendar day. paid_at::date would
-- cast in UTC, so a payment entered at 9pm IST (15:30 UTC) is fine but one at
-- 1am IST (19:30 UTC the previous day) would land on yesterday. That would make
-- "total paid today" (recording 12) wrong for exactly the late-evening entries a
-- collection agent is most likely to be making.
--
-- stable, not immutable: it depends on the tz database.
-- ----------------------------------------------------------------------------
create or replace function public.ist_date(p_ts timestamptz)
returns date
language sql stable set search_path = public as $$
  select (p_ts at time zone 'Asia/Kolkata')::date;
$$;

-- ----------------------------------------------------------------------------
-- installments_settled(emi, collected, tenure) -> int
--
-- THE substitution at the heart of this round. Everywhere the system used to ask
-- "how many payment rows are there", it now asks "how many whole EMIs does the
-- money cover". Cash is applied to installments in order, so integer division is
-- the settled count.
--
-- Capped at the tenure so an overpayment cannot read "Paid 13 of 12".
-- Guarded on emi <= 0 so a bad loan row returns 0 instead of dividing by zero.
--
-- Note this keeps every downstream formula algebraically identical for anyone who
-- has only ever paid whole EMIs (settled == count exactly), which is why no
-- existing customer changes reminder bucket when this deploys.
--
-- Mirrored by installmentsSettled() in lib/loan-status.ts — change both together.
-- ----------------------------------------------------------------------------
create or replace function public.installments_settled(
  p_emi bigint, p_collected bigint, p_tenure int
) returns int
language sql immutable set search_path = public as $$
  select case
    when coalesce(p_emi, 0) <= 0 then 0
    else least((coalesce(p_collected, 0) / p_emi)::int, p_tenure)
  end;
$$;

-- ----------------------------------------------------------------------------
-- pending_month_no(emi, collected, tenure) -> int
--
-- "the EMI or month against which the balance is pending" (recordings 11 and 14)
-- — the installment the next rupee gets applied to. NULL once the whole tenure is
-- covered, so callers render "Loan complete" rather than month 13.
-- ----------------------------------------------------------------------------
create or replace function public.pending_month_no(
  p_emi bigint, p_collected bigint, p_tenure int
) returns int
language sql immutable set search_path = public as $$
  select case
    when public.installments_settled(p_emi, p_collected, p_tenure) >= p_tenure then null
    else public.installments_settled(p_emi, p_collected, p_tenure) + 1
  end;
$$;

-- ----------------------------------------------------------------------------
-- pending_month_shortfall(emi, collected, tenure) -> bigint
--
-- How much more is needed to finish pending_month_no. On an exact multiple this
-- is a full EMI (nothing has been paid toward that month yet); after a partial it
-- is the remainder. This is the "remaining EMI balance" of recording 14.
-- ----------------------------------------------------------------------------
create or replace function public.pending_month_shortfall(
  p_emi bigint, p_collected bigint, p_tenure int
) returns bigint
language sql immutable set search_path = public as $$
  select case
    when coalesce(p_emi, 0) <= 0 then 0::bigint
    when public.installments_settled(p_emi, p_collected, p_tenure) >= p_tenure then 0::bigint
    else p_emi - (coalesce(p_collected, 0) % p_emi)
  end;
$$;

-- ============================================================================
-- SECTION 2 — the ledger table
-- ============================================================================

alter table public.penalties
  add column if not exists month_no        int,
  add column if not exists source          text not null default 'accrual',
  add column if not exists note            text,
  add column if not exists created_by      uuid references public.users(id),
  add column if not exists accrued_through date;

-- text + CHECK rather than a new enum on purpose: an ALTER TYPE ... ADD VALUE
-- cannot be used in the same transaction that adds it, which would force this
-- into its own migration file (precedent: 20260517090000_add_owner_role.sql) for
-- a two-value domain that gains nothing from being an enum.
alter table public.penalties drop constraint if exists penalties_source_check;
alter table public.penalties
  add constraint penalties_source_check check (source in ('accrual', 'manual'));

-- Idempotency for the engine: one accrual row per loan-month, no matter how many
-- times accrue_penalties runs. Partial, so admin-entered manual charges (which
-- may repeat, and may have no month) are unconstrained.
create unique index if not exists penalties_loan_month_accrual_uq
  on public.penalties (loan_id, month_no)
  where source = 'accrual' and month_no is not null;

create index if not exists penalties_loan_month_idx
  on public.penalties (loan_id, month_no);

comment on column public.penalties.month_no is
  'Installment number this charge belongs to. NULL for a manual admin charge.';
comment on column public.penalties.source is
  '''accrual'' = written by accrue_penalties(); ''manual'' = entered by an admin.';
comment on column public.penalties.accrued_through is
  'For penalty_type = per_day only: the date amount_paise currently covers.';

-- ----------------------------------------------------------------------------
-- loans.penalty_accrual_from
--
-- Switching the engine on charges every late month since each loan started. That
-- is the correct reading of "penalty is Rs 500 per month late", but it means a
-- customer whose late EMIs were accepted without penalty in the physical book
-- suddenly owes thousands the day this deploys, across ~5,000 backfilled records.
--
-- NULL (the default) = charge the full history. Limiting the engine to go-live is
-- then a one-line UPDATE rather than a schema change:
--
--     update public.loans set penalty_accrual_from = date '2026-08-12';
--
-- Same escape-hatch shape as loans.grace_days. Open question for the client.
-- ----------------------------------------------------------------------------
alter table public.loans add column if not exists penalty_accrual_from date;

comment on column public.loans.penalty_accrual_from is
  'Earliest installment due-date the auto-penalty engine may charge for. '
  'NULL = charge from the first EMI date (the full history).';

-- ============================================================================
-- SECTION 3 — the accrual engine
-- ============================================================================

-- ----------------------------------------------------------------------------
-- accrue_penalties(loan, as_of) -> int   (count of NEW charge rows)
--
-- Idempotent. Charges Rs 500 (loans.penalty_rate_paise) for each installment that
-- was still short at its own due date + grace_days.
--
-- The critical detail is that each month is judged against the money received by
-- *that month's* deadline, never against today's balance. If it were judged
-- against today, a customer who was three months late and has since caught up
-- would be charged nothing the first time this ever ran — silently forgiving the
-- whole backfilled history. Judging by deadline makes the answer permanent and
-- independent of when the job happens to run, which is also what lets pg_cron,
-- the write path and the read path all call this and agree.
--
-- security definer because penalties_admin_write bars employees from inserting,
-- but an employee logging a payment must still trigger accrual. The role guard
-- below is what keeps that from becoming a write surface: read-only roles (owner,
-- sub_id) make this a no-op, so the lazy call from the customer card cannot let
-- an owner write.
--
-- KNOWN WRINKLE: a charge is never removed once written. If a payment is entered
-- with a back-dated paid_at *after* accrual has already charged that month, the
-- charge stays even though the money now shows as having arrived in time. That is
-- the deliberate trade: charges being permanent is what makes the balance stable
-- and reprintable. An admin can waive the row (set_penalty_charge). Forward entry
-- — the normal flow — is unaffected, because log_payment accrues before it writes.
-- ----------------------------------------------------------------------------
create or replace function public.accrue_penalties(
  p_loan_id uuid,
  p_as_of   date default current_date
) returns int
language plpgsql security definer set search_path = public as $$
declare
  l           public.loans;
  v_purchase  date;
  v_first     date;
  v_from      date;
  v_grace     int;
  v_due       int;
  v_created   int := 0;
  v_clear     date[];
  m           int;
  v_due_date  date;
  v_deadline  date;
  v_through   date;
  v_amount    bigint;
  v_row       public.penalties;
begin
  -- The owner is read-only at the DB layer (CLAUDE.md > Roles), and a sub_id only
  -- ever inserts customers. Neither may trigger a write, even indirectly.
  if not public.is_employee_or_admin() then
    return 0;
  end if;

  select * into l from public.loans where id = p_loan_id;
  if l.id is null or l.status <> 'active' then
    return 0;
  end if;
  if coalesce(l.penalty_rate_paise, 0) <= 0 or coalesce(l.emi_paise, 0) <= 0 then
    return 0;
  end if;

  select purchase_date into v_purchase from public.customers where id = l.customer_id;
  v_first := coalesce(l.first_emi_date, (v_purchase + interval '1 month')::date);
  if v_first is null then
    return 0;
  end if;

  v_grace := coalesce(l.grace_days, 0);
  v_from  := coalesce(l.penalty_accrual_from, v_first);
  v_due   := public.installments_due(l.first_emi_date, v_purchase, l.tenure_months, p_as_of);
  if v_due = 0 then
    return 0;
  end if;

  -- clear_date[k] = the IST day on which cumulative EMI collections first reached
  -- k x emi, or NULL if they never have. One pass over the loan's payments.
  select array_agg(c.cd order by g.k)
    into v_clear
    from generate_series(1, l.tenure_months) as g(k)
    left join lateral (
      select public.ist_date(x.paid_at) as cd
        from (
          -- Ordered by invoice_no, not id: same-day receipts share one midnight
          -- paid_at, and a random-UUID tie-break would put the running total in
          -- an arbitrary order. See the note in payment_receipt().
          select p.paid_at,
                 p.invoice_no,
                 p.id,
                 sum(p.amount_paise) over (
                   order by p.paid_at, coalesce(p.invoice_no, ''), p.id
                 ) as running
            from public.payments p
           where p.loan_id = p_loan_id
             and p.deleted_at is null
        ) x
       where x.running >= g.k::bigint * l.emi_paise
       order by x.paid_at, coalesce(x.invoice_no, ''), x.id
       limit 1
    ) c on true;

  for m in 1 .. v_due loop
    v_due_date := (v_first + make_interval(months => m - 1))::date;
    v_deadline := v_due_date + v_grace;

    -- Deadlines only increase, so the first month still inside its grace window
    -- ends the scan.
    exit when v_deadline >= p_as_of;

    -- Before this loan's accrual start date (the go-live escape hatch).
    continue when v_due_date < v_from;

    -- Paid in full, in time. Never charged.
    continue when v_clear[m] is not null and v_clear[m] <= v_deadline;

    -- monthly_fixed: one flat Rs 500 however late (PRD open Q #2, answered by the
    -- client 2026-08-02). per_day: grows daily until the month clears, then
    -- freezes — no loan uses it today, but the column stays honest.
    v_through := least(coalesce(v_clear[m], p_as_of), p_as_of);
    v_amount  := case
      when l.penalty_type = 'per_day'
        then greatest(v_through - v_deadline, 1)::bigint * l.penalty_rate_paise
      else l.penalty_rate_paise
    end;

    select * into v_row from public.penalties
     where loan_id = p_loan_id and month_no = m and source = 'accrual';

    if v_row.id is null then
      insert into public.penalties (
        loan_id, month_no, period_start, period_end, amount_paise,
        source, accrued_through, created_by, branch_id
      ) values (
        p_loan_id, m, v_due_date, v_deadline, v_amount,
        'accrual',
        case when l.penalty_type = 'per_day' then v_through end,
        auth.uid(), l.branch_id
      );
      v_created := v_created + 1;

    elsif l.penalty_type = 'per_day'
      and v_row.waived_at is null
      and coalesce(v_row.accrued_through, v_deadline) < v_through
    then
      -- Only a per-day charge ever moves. A monthly_fixed row is written once and
      -- left alone, so an admin's edit (set_penalty_charge) is never overwritten.
      update public.penalties
         set amount_paise = v_amount, accrued_through = v_through
       where id = v_row.id;
    end if;
  end loop;

  return v_created;
end;
$$;

-- ----------------------------------------------------------------------------
-- accrue_penalties_all(branch) -> int
--
-- The sweep entry point. This is what pg_cron will call once the extension is
-- enabled on the project, and what the planned /api/penalty cron-job.org route
-- should hit:
--
--     select cron.schedule('penalty-sweep', '15 19 * * *',
--                          $$ select public.accrue_penalties_all() $$);
--
-- Not scheduled here — pg_cron has to be enabled in the Supabase dashboard first,
-- and a migration that fails on a missing extension blocks every later push.
-- ----------------------------------------------------------------------------
create or replace function public.accrue_penalties_all(p_branch uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.loans
     where status = 'active'
       and (p_branch is null or branch_id = p_branch)
  loop
    n := n + public.accrue_penalties(r.id);
  end loop;
  return n;
end;
$$;

-- ============================================================================
-- SECTION 4 — admin penalty adjustment (recording 10)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- set_penalty_charge(p jsonb) -> uuid
--
-- Recording 10: "Only the Owner and Admin should be allowed to increase or
-- decrease a customer's penalty amount. Employees should not."
--
-- Implemented as ADMIN ONLY. The owner is read-only at the DB layer — it has no
-- write policy on any operational table, current_branch_id() is NULL for it (so
-- it has no branch to write into), and log_payment/update_customer already reject
-- it with pgTAP asserting so. The role being excluded in the client's request is
-- `employee`, and admin-only delivers exactly that. To admit the owner later,
-- change the single role test below and derive the branch from the target row
-- instead of the caller.
--
-- Three verbs in one RPC:
--   {penalty_id, amount_paise}       edit a charge up or down
--   {penalty_id, waive: true}        waive it (waive: false un-waives)
--   {loan_id, amount_paise, note}    add a manual charge
--
-- Amounts are edited in place rather than offset by signed adjustment rows: the
-- audit trigger already captures old_value/new_value with the admin's id and a
-- timestamp (PRD §3.5 "all penalty edits are logged"), penalty_charged stays a
-- plain non-negative sum(), and "make it Rs 300" is how the client thinks.
-- ----------------------------------------------------------------------------
create or replace function public.set_penalty_charge(p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  caller public.users;
  v_row  public.penalties;
  v_loan public.loans;
  v_id   uuid;
  v_amt  bigint;
begin
  select * into caller from public.users where id = auth.uid();
  if caller.id is null or caller.disabled_at is not null then
    raise exception 'Not authorized';
  end if;
  if caller.role <> 'admin' then
    raise exception 'Only an admin can change a penalty amount';
  end if;
  if caller.branch_id is null then
    raise exception 'Your account is not assigned to a branch';
  end if;

  v_id := nullif(p->>'penalty_id', '')::uuid;

  if v_id is not null then
    -- Branch-scoped even though this is security definer.
    select * into v_row from public.penalties
     where id = v_id and branch_id = caller.branch_id;
    if v_row.id is null then
      raise exception 'Penalty not found in your branch';
    end if;

    v_amt := nullif(p->>'amount_paise', '')::bigint;
    if v_amt is not null and v_amt < 0 then
      raise exception 'A penalty amount cannot be negative';
    end if;

    update public.penalties set
      amount_paise = coalesce(v_amt, amount_paise),
      note         = coalesce(nullif(btrim(p->>'note'), ''), note),
      waived_at    = case
                       when (p->>'waive')::boolean is true  then now()
                       when (p->>'waive')::boolean is false then null
                       else waived_at
                     end,
      waived_by    = case
                       when (p->>'waive')::boolean is true  then auth.uid()
                       when (p->>'waive')::boolean is false then null
                       else waived_by
                     end
    where id = v_id;

    return v_id;
  end if;

  -- No penalty_id -> a new manual charge on this loan.
  select * into v_loan from public.loans
   where id = nullif(p->>'loan_id', '')::uuid
     and branch_id = caller.branch_id;
  if v_loan.id is null then
    raise exception 'Loan not found in your branch';
  end if;

  v_amt := coalesce(nullif(p->>'amount_paise', '')::bigint, 0);
  if v_amt <= 0 then
    raise exception 'Enter a penalty amount greater than 0';
  end if;

  insert into public.penalties (
    loan_id, month_no, period_start, period_end, amount_paise,
    source, note, created_by, branch_id
  ) values (
    v_loan.id,
    nullif(p->>'month_no', '')::int,
    coalesce(nullif(p->>'period_start', '')::date, current_date),
    coalesce(nullif(p->>'period_end', '')::date, current_date),
    v_amt,
    'manual',
    nullif(btrim(p->>'note'), ''),
    auth.uid(),
    v_loan.branch_id
  )
  returning id into v_id;

  return v_id;
end;
$$;
