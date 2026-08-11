-- Phase 4.9 (1/4) — Client feedback round 3: partial payments, schema.
--
-- The client sent 15 voice recordings after testing the Phase 4.5 build. Nine of
-- them describe the same underlying problem: the ledger assumes every payment is
-- exactly one full EMI, and in the field it never is.
--
--   Recording 11  "Paid Amount" box — the customer hands over less than the EMI
--   Recording 13  a penalty-only receipt, with the EMI untouched
--   Recording 14  the short EMI is carried forward as a balance
--   Recording  2  a Remark column in the instalment register
--
-- This file only widens the payments table so those receipts can exist. The math
-- that reads them lands in 20260812120200_loan_balances_view.sql, and the write
-- path in 20260812120300_payment_rpcs_v3.sql.

-- ----------------------------------------------------------------------------
-- PAYMENTS — allow a short EMI and a penalty-only receipt.
--
-- `amount_paise bigint not null check (amount_paise > 0)` was declared inline in
-- 20260507120000_schema.sql, so Postgres named it payments_amount_paise_check.
-- Dropped by that generated name; the `if exists` keeps a re-run harmless.
--
-- The pair of new CHECKs says: neither column may be negative, and a receipt has
-- to be for *something*. That is what unlocks recording 13 (installment 0,
-- penalty 500) while still refusing an entirely empty row.
-- ----------------------------------------------------------------------------
alter table public.payments drop constraint if exists payments_amount_paise_check;

alter table public.payments
  add constraint payments_amount_nonneg
    check (amount_paise >= 0),
  add constraint payments_amount_or_penalty
    check (amount_paise + penalty_paise > 0);

-- ----------------------------------------------------------------------------
-- Recording 2 — a free-text remark per instalment, printed on the receipt and
-- the statement. Nullable: every existing row predates the request.
-- ----------------------------------------------------------------------------
alter table public.payments add column if not exists remark text;

-- ----------------------------------------------------------------------------
-- Soft delete + updated_at.
--
-- payments was deliberately left out of the Phase 2 updated_at/deleted_at loops
-- because a payment row was append-only: one row, one full EMI, never edited.
-- Partial payments end that — a mis-keyed "3000" that should have been "30000"
-- is now the most likely support call, and CLAUDE.md is soft-delete-only.
--
-- Adding both here rather than later is deliberate: every aggregate in this round
-- is being rewritten anyway, so `and deleted_at is null` is free today and would
-- otherwise mean re-touching all five of them a second time.
-- ----------------------------------------------------------------------------
alter table public.payments
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- The as-of window in payment_receipt() orders by (paid_at, id) inside a loan,
-- and the new balance aggregates all filter on loan_id. This is their index.
create index if not exists payments_loan_paid_idx
  on public.payments (loan_id, paid_at, id);

create index if not exists payments_deleted_idx
  on public.payments (deleted_at)
  where deleted_at is not null;

-- ----------------------------------------------------------------------------
-- Recording 3 — "a unique receipt number should be generated automatically".
--
-- It already is. payments.invoice_no has been stamped from payments_invoice_seq
-- since 20260802120000; what the client is actually asking for is that the thing
-- printed on the slip be *called* a receipt number. That is a label change in the
-- app, not a schema change — the columns are documented here so the next reader
-- does not "fix" the naming and break the physical-book reconciliation.
-- ----------------------------------------------------------------------------
comment on column public.payments.invoice_no is
  'System-generated unique receipt number (INV-000123) printed on the slip. '
  'Client feedback round 3 recording 3. The column name is historical; the UI '
  'and print labels read "Receipt No.".';

comment on column public.payments.receipt_no is
  'The number hand-written in the physical receipt book. Free text, not unique, '
  'often blank. UI and print label: "Book no.".';

comment on column public.payments.amount_paise is
  'Money applied to the EMI on this receipt. May be 0 (penalty-only receipt) and '
  'may be less than loans.emi_paise (partial payment) — installments settled is '
  'derived from the running total, never from the row count. See loan_balances.';

comment on column public.payments.penalty_paise is
  'Money applied to the penalty balance on this receipt. Penalty *charged* lives '
  'in public.penalties; this column is only what was collected.';

comment on column public.payments.remark is
  'Free-text note for the instalment register (recording 2).';
