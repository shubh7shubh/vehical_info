-- Phase 4.5 (1/2) — Client feedback round 2: schema changes.
--
-- The client reviewed the Phase 4 build and answered two PRD §8 open questions
-- outright, plus asked for a printable EMI invoice and an explicit first-EMI date:
--
--   Open Q #8  bank names      -> "Dhanshree Bank" / "Bhagyalaxmi Bank"
--   Open Q #2  penalty rule    -> monthly fixed Rs 500 (was per_day Rs 50)
--   New        first EMI date  -> entered/derived at onboarding, not implicit
--   New        invoice number  -> a stable unique id to print on each receipt
--
-- Additive only. Nothing here changes an existing reminder bucket: first_emi_date
-- is backfilled to started_at + 1 month, which is exactly the schedule the
-- purchase-date-anchored math already assumed.

-- ----------------------------------------------------------------------------
-- BANKS — the real partner bank names (Open Q #8).
-- banks is global (no branch_id) and name is UNIQUE, so this is a plain rename:
-- every customers.bank_id keeps pointing at the same row. Guarded so a re-run,
-- or a `db reset` that replays the original seed, cannot fail on the unique index.
-- ----------------------------------------------------------------------------
update public.banks set name = 'Dhanshree Bank'
 where name = 'Bank A'
   and not exists (select 1 from public.banks b where b.name = 'Dhanshree Bank');

update public.banks set name = 'Bhagyalaxmi Bank'
 where name = 'Bank B'
   and not exists (select 1 from public.banks b where b.name = 'Bhagyalaxmi Bank');

-- ----------------------------------------------------------------------------
-- LOANS — penalty is monthly fixed Rs 500 (Open Q #2).
-- 'monthly_fixed' is already a penalty_type enum value (created in the Phase 2
-- schema), so no ALTER TYPE is needed.
-- ----------------------------------------------------------------------------
alter table public.loans
  alter column penalty_type       set default 'monthly_fixed',
  alter column penalty_rate_paise set default 50000;   -- Rs 500

-- Move existing loans onto the new rule, but only the ones still sitting on the
-- old defaults — a loan whose penalty was deliberately set per-customer is left
-- alone (PRD §3.5 allows per-customer penalty config).
update public.loans
   set penalty_type = 'monthly_fixed',
       penalty_rate_paise = 50000
 where penalty_type = 'per_day'
   and penalty_rate_paise = 5000;

-- ----------------------------------------------------------------------------
-- LOANS — explicit first EMI date.
--
-- Until now the schedule was implicit: installment N was due purchase_date + N
-- months, so "installment 1 is due one month after purchase" was baked into the
-- months-behind math. The client wants that date visible and editable at
-- onboarding, so it becomes a real column.
--
-- Deliberately NULLABLE: every reader coalesces to purchase_date + 1 month, so
-- pre-existing rows and any write path that omits it still behave exactly as
-- before. See public.customer_status_counts() and lib/loan-status.ts — those two
-- must always agree.
-- ----------------------------------------------------------------------------
alter table public.loans add column first_emi_date date;

update public.loans
   set first_emi_date = (started_at + interval '1 month')::date
 where first_emi_date is null;

comment on column public.loans.first_emi_date is
  'Date the first installment falls due. Defaults to purchase/start date + 1 month; anchors the whole schedule.';

-- ----------------------------------------------------------------------------
-- PAYMENTS — a printable invoice number.
--
-- receipt_no is the number the employee copies off their physical receipt book:
-- free text, nullable, not unique. An invoice needs its own stable identifier,
-- so log_payment stamps one from a sequence. The printed slip shows both.
-- ----------------------------------------------------------------------------
create sequence if not exists public.payments_invoice_seq;

alter table public.payments add column invoice_no text;

-- Backfill in payment order so the existing rows read like a real invoice book.
with numbered as (
  select id, row_number() over (order by paid_at, id) as rn
    from public.payments
   where invoice_no is null
)
update public.payments p
   set invoice_no = 'INV-' || lpad(n.rn::text, 6, '0')
  from numbered n
 where p.id = n.id;

-- is_called = false -> the next nextval() returns exactly this value, i.e. one
-- past the highest number handed out above.
select setval(
  'public.payments_invoice_seq',
  (select count(*) from public.payments) + 1,
  false
);

create unique index payments_invoice_no_uq
  on public.payments (invoice_no)
  where invoice_no is not null;

comment on column public.payments.invoice_no is
  'System-generated unique invoice number (INV-000123) printed on the EMI receipt. Distinct from the hand-written receipt_no.';
