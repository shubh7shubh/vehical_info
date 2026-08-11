-- Phase 4.95 (1/2) — Client feedback round 3, slice B: Foreclosure & Seizing.
--
-- Recordings 4 to 9 spec a whole screen:
--   4  a separate page: enter the loan number, see the loan, Add Foreclosure /
--      Add Seizing
--   5  foreclosure only after six months from the loan start date
--   6  the Add Foreclosure button is live only for those customers
--   7  the Seizing section searches the same way and has its own Add button
--   8  Exit Seizing once every due, penalty and the foreclosure amount is cleared
--   9  only Owner and Admin may remove a customer from Seizing
--
-- public.foreclosures and public.seizures have existed since the Phase 2 schema
-- and have never had a reader or a writer. Both already carry branch_id, the
-- set_branch_id arm, the audit trigger, the updated_at trigger and branch-scoped
-- RLS, so this file only adds the columns the screen actually needs.
--
-- NO NEW ENUM VALUE. Exit Seizing is seizure_status 'resolved' plus exited_at —
-- 'resolved' already means "seizure concluded", and adding a synonym would force
-- its own migration file (ALTER TYPE ... ADD VALUE cannot be used in the
-- transaction that adds it; precedent 20260517090000_add_owner_role.sql) for no
-- gain. exited_at is what separates "released because they paid" from any future
-- "resolved by sale".

-- ----------------------------------------------------------------------------
-- FORECLOSURES — snapshot the calculation, don't just store the total.
--
-- PRD §3.7 wants the screen to show remaining months, the original interest, the
-- reduction, the bank charge and the final payable. Storing only
-- final_payable_paise would mean a foreclosure printed today could not be
-- explained six months later, so every line of the quote is kept.
-- ----------------------------------------------------------------------------
alter table public.foreclosures
  add column if not exists interest_waived_paise bigint not null default 0,
  add column if not exists emi_outstanding_paise bigint not null default 0,
  add column if not exists penalty_balance_paise bigint not null default 0,
  add column if not exists remaining_months      int,
  add column if not exists notes                 text,
  add column if not exists created_by            uuid references public.users(id);

comment on column public.foreclosures.original_interest_paise is
  'Interest still scheduled over the remaining months, straight-line: '
  'total_interest x remaining_months / tenure. Quoted, not charged.';
comment on column public.foreclosures.interest_waived_paise is
  'The reduction the branch is granting. Operator-entered; defaults to the full '
  'remaining interest (PRD §3.7 "interest waived").';
comment on column public.foreclosures.bank_charge_paise is
  'The bank''s foreclosure charge — Rs 1,000 by default (PRD §3.7).';
comment on column public.foreclosures.final_payable_paise is
  'greatest(emi_outstanding - interest_waived, 0) + bank_charge + penalty_balance';

-- One open (unpaid) quote per loan. A second quote is only allowed once the
-- first is settled or the loan has moved on.
create unique index if not exists foreclosures_open_uq
  on public.foreclosures (loan_id)
  where paid_at is null;

-- ----------------------------------------------------------------------------
-- SEIZURES — tie to the loan, and record the exit.
--
-- seizures has only ever had customer_id. The money checks in exit_seizure are
-- per-loan (a customer can hold more than one loan over time), so the row needs
-- to name which loan it was taken against.
-- ----------------------------------------------------------------------------
alter table public.seizures
  add column if not exists loan_id     uuid references public.loans(id),
  add column if not exists exited_at   timestamptz,
  add column if not exists exited_by   uuid references public.users(id),
  add column if not exists exit_reason text;

comment on column public.seizures.exited_at is
  'Set by exit_seizure() when the customer cleared everything and the vehicle '
  'was released (recording 8). status also moves to ''resolved''.';

create index if not exists seizures_loan_idx     on public.seizures (loan_id);
create index if not exists seizures_customer_idx on public.seizures (customer_id);

-- A customer can only be under one live seizure at a time — otherwise "Add
-- Seizing" clicked twice leaves two open records and Exit Seizing becomes
-- ambiguous.
create unique index if not exists seizures_open_uq
  on public.seizures (customer_id)
  where status in ('pending', 'active');

-- Backfill loan_id for any seizure written before this column existed (there are
-- none in practice — the table has never been written to — but a later import
-- would otherwise leave them unusable).
update public.seizures s
   set loan_id = l.id
  from public.loans l
 where s.loan_id is null
   and l.customer_id = s.customer_id
   and l.branch_id = s.branch_id
   and l.status = 'active';

-- set_branch_id() needs no new arm: its 'seizures' case already resolves the
-- branch from customers, and record_seizure always supplies customer_id. The
-- 'foreclosures' case resolves from loans, which is unchanged.
