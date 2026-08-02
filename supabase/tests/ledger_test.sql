-- pgTAP tests for the ledger / installment-registry features.
-- Run with:  npx supabase test db   (needs the local stack — Docker)
--
-- Time is SIMULATED, never waited for: a customer's overdue status is derived
-- from purchase_date vs. today, so we backdate purchase_date (and seed a real
-- payment history) to reproduce "3 months behind" instantly. This is the same
-- trick to use for manual testing — set the purchase date in the past.

begin;
select plan(38);

-- ---------------------------------------------------------------------------
-- Fixtures: a couple of branches + a bank. (Main Branch already exists from the
-- backfill migration; we add our own so tests are self-contained.)
-- ---------------------------------------------------------------------------
insert into public.branches (id, name, code) values
  ('11111111-1111-1111-1111-111111111111', 'Test Branch A', 'TSTA'),
  ('22222222-2222-2222-2222-222222222222', 'Test Branch B', 'TSTB');
insert into public.banks (id, name, color) values
  ('33333333-3333-3333-3333-333333333333', 'Test Bank', '#123456');

-- ===========================================================================
-- 1. months_elapsed() — the schedule math (mirrors lib/loan-status.ts)
-- ===========================================================================
select is(public.months_elapsed('2026-01-15', '2026-01-15'), 0,
  'months_elapsed: same day is 0');
select is(public.months_elapsed('2026-01-15', '2026-02-14'), 0,
  'months_elapsed: day before the anniversary is still 0');
select is(public.months_elapsed('2026-01-15', '2026-02-15'), 1,
  'months_elapsed: the anniversary day counts as 1');
select is(public.months_elapsed('2026-01-15', '2026-04-15'), 3,
  'months_elapsed: three whole months');

-- ===========================================================================
-- 2. customer_status_counts() — the 4 reminder buckets.
-- All four customers were "purchased" 5 months ago (simulated). Their bucket
-- depends purely on how many of the 5 due installments they have paid:
--   paid 5 -> 0 behind  -> green
--   paid 3 -> 2 behind  -> yellow
--   paid 2 -> 3 behind  -> orange
--   paid 1 -> 4 behind  -> red
-- Triggers are disabled while seeding so we can write rows directly.
-- ===========================================================================
set session_replication_role = replica;

insert into public.customers (id, first_name, account_no, bank_id, branch_id, purchase_date) values
  ('d0000000-0000-0000-0000-000000000001', 'Green',  'G1', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', current_date - interval '5 months'),
  ('d0000000-0000-0000-0000-000000000002', 'Yellow', 'Y1', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', current_date - interval '5 months'),
  ('d0000000-0000-0000-0000-000000000003', 'Orange', 'O1', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', current_date - interval '5 months'),
  ('d0000000-0000-0000-0000-000000000004', 'Red',    'R1', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', current_date - interval '5 months');

insert into public.loans (id, customer_id, principal_paise, emi_paise, tenure_months, due_day, started_at, branch_id) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 10000000, 500000, 24, 1, current_date - interval '5 months', '11111111-1111-1111-1111-111111111111'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 10000000, 500000, 24, 1, current_date - interval '5 months', '11111111-1111-1111-1111-111111111111'),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 10000000, 500000, 24, 1, current_date - interval '5 months', '11111111-1111-1111-1111-111111111111'),
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 10000000, 500000, 24, 1, current_date - interval '5 months', '11111111-1111-1111-1111-111111111111');

-- Seed each loan's paid installments.
insert into public.payments (loan_id, amount_paise, mode, branch_id, paid_at)
  select 'e0000000-0000-0000-0000-000000000001', 500000, 'cash', '11111111-1111-1111-1111-111111111111', current_date - (g || ' months')::interval from generate_series(1, 5) g;
insert into public.payments (loan_id, amount_paise, mode, branch_id, paid_at)
  select 'e0000000-0000-0000-0000-000000000002', 500000, 'cash', '11111111-1111-1111-1111-111111111111', current_date - (g || ' months')::interval from generate_series(1, 3) g;
insert into public.payments (loan_id, amount_paise, mode, branch_id, paid_at)
  select 'e0000000-0000-0000-0000-000000000003', 500000, 'cash', '11111111-1111-1111-1111-111111111111', current_date - (g || ' months')::interval from generate_series(1, 2) g;
insert into public.payments (loan_id, amount_paise, mode, branch_id, paid_at)
  select 'e0000000-0000-0000-0000-000000000004', 500000, 'cash', '11111111-1111-1111-1111-111111111111', current_date - (g || ' months')::interval from generate_series(1, 1) g;

set session_replication_role = origin;

select is((select green  from public.customer_status_counts()), 1, 'status: one green (paid up)');
select is((select yellow from public.customer_status_counts()), 1, 'status: one yellow (2 behind)');
select is((select orange from public.customer_status_counts()), 1, 'status: one orange (3 behind)');
select is((select red    from public.customer_status_counts()), 1, 'status: one red (4 behind)');

-- ===========================================================================
-- 3. account_no is unique PER BRANCH (dedup), but free across branches.
-- ===========================================================================
set session_replication_role = replica;
insert into public.customers (first_name, account_no, bank_id, branch_id)
  values ('Dup A', '3473', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111');

select throws_ok(
  $$ insert into public.customers (first_name, account_no, bank_id, branch_id)
       values ('Dup A2', '3473', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111') $$,
  '23505',
  null,
  'account_no: duplicate within the same branch is rejected'
);
select lives_ok(
  $$ insert into public.customers (first_name, account_no, bank_id, branch_id)
       values ('Dup B', '3473', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222') $$,
  'account_no: the same number is allowed in a different branch'
);
set session_replication_role = origin;

-- ===========================================================================
-- 4. RPCs under simulated auth. auth.uid() reads request.jwt.claims, so we set
-- the claim to a real user and call the functions as that user.
-- ===========================================================================
-- Users (the auth.users insert fires handle_new_auth_user -> public.users).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'emp@test.local',   '', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'sub@test.local',   '', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'owner@test.local', '', '{}', '{}', now(), now());

update public.users set branch_id = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.users set role = 'sub_id', branch_id = '22222222-2222-2222-2222-222222222222', sub_id_range_start = 1, sub_id_range_end = 1 where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
update public.users set role = 'owner', branch_id = null where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ---- as employee ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select lives_ok(
  format($$ select public.create_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer', jsonb_build_object('account_no','EMP-1','first_name','Emp','bank_id','33333333-3333-3333-3333-333333333333'),
      'loan', jsonb_build_object('principal_paise',10500000,'emi_paise',525000,'tenure_months',24,'purchase_date',(current_date - interval '4 months')::text)
    )::text),
  'create_customer: employee adds a customer'
);
select throws_like(
  format($$ select public.create_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer', jsonb_build_object('account_no','EMP-1','first_name','Dup','bank_id','33333333-3333-3333-3333-333333333333'),
      'loan', jsonb_build_object('principal_paise',10500000,'emi_paise',525000,'tenure_months',24,'purchase_date',current_date::text)
    )::text),
  '%already exists%',
  'create_customer: duplicate account number is rejected'
);

-- ---- as sub_id (range = 1 record) ----------------------------------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select lives_ok(
  format($$ select public.create_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer', jsonb_build_object('account_no','SUB-1','first_name','SubA','bank_id','33333333-3333-3333-3333-333333333333'),
      'loan', jsonb_build_object('principal_paise',10500000,'emi_paise',525000,'tenure_months',24,'purchase_date',current_date::text)
    )::text),
  'sub_id: first record within range is allowed'
);
select throws_like(
  format($$ select public.create_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer', jsonb_build_object('account_no','SUB-2','first_name','SubB','bank_id','33333333-3333-3333-3333-333333333333'),
      'loan', jsonb_build_object('principal_paise',10500000,'emi_paise',525000,'tenure_months',24,'purchase_date',current_date::text)
    )::text),
  '%range exhausted%',
  'sub_id: a record past the assigned range is rejected'
);

-- ---- log_payment: employee can, owner cannot -----------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select lives_ok(
  format($$ select public.log_payment(%L::jsonb) $$,
    jsonb_build_object(
      'customer_id', (select id from public.customers where account_no = 'EMP-1' and branch_id = '22222222-2222-2222-2222-222222222222'),
      'month_no', 1, 'installment_paise', 525000, 'paid_at', current_date::text
    )::text),
  'log_payment: employee records an installment'
);

select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);
select throws_like(
  format($$ select public.log_payment(%L::jsonb) $$,
    jsonb_build_object(
      'customer_id', (select id from public.customers where account_no = 'EMP-1' and branch_id = '22222222-2222-2222-2222-222222222222'),
      'month_no', 2, 'installment_paise', 525000, 'paid_at', current_date::text
    )::text),
  '%cannot log payments%',
  'log_payment: the owner is read-only and cannot log payments'
);

-- ===========================================================================
-- 5. Phase 4.5 — installments_due(): the schedule is anchored on the FIRST EMI
-- date. Installment 1 is due ON that date, nothing before it, capped at tenure.
-- Mirrors installmentsDue() in lib/loan-status.ts.
-- ===========================================================================
-- Every argument is cast: an untyped NULL literal leaves Postgres unable to
-- resolve the overload.
select is(public.installments_due('2026-02-15'::date, null::date, 24, '2026-02-14'::date), 0,
  'installments_due: nothing is due before the first EMI date');
select is(public.installments_due('2026-02-15'::date, null::date, 24, '2026-02-15'::date), 1,
  'installments_due: the first EMI date itself counts as 1');
select is(public.installments_due('2026-02-15'::date, null::date, 24, '2026-04-15'::date), 3,
  'installments_due: three installments due two months later');
select is(public.installments_due(null::date, '2026-01-15'::date, 24, '2026-04-15'::date), 3,
  'installments_due: falls back to purchase date + 1 month when unset');
select is(public.installments_due('2024-02-15'::date, null::date, 24, '2026-07-15'::date), 24,
  'installments_due: capped at the loan tenure');

-- ===========================================================================
-- 6. Phase 4.5 — the client's real bank names (PRD open question #8).
-- ===========================================================================
select is(
  (select count(*)::int from public.banks
    where name in ('Dhanshree Bank', 'Bhagyalaxmi Bank')),
  2,
  'banks: seeded Bank A / Bank B were renamed to the real partner banks'
);

-- ===========================================================================
-- 7. Phase 4.5 — create_customer sets the monthly Rs 500 penalty default and
-- derives the first EMI date. EMP-1 was created above with a purchase date
-- 4 months ago and no explicit first EMI date.
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select is(
  (select l.penalty_type::text from public.loans l
     join public.customers c on c.id = l.customer_id where c.account_no = 'EMP-1'),
  'monthly_fixed',
  'loans: new loans default to a monthly fixed penalty'
);
select is(
  (select l.penalty_rate_paise from public.loans l
     join public.customers c on c.id = l.customer_id where c.account_no = 'EMP-1'),
  50000::bigint,
  'loans: the monthly penalty is Rs 500'
);
select is(
  (select l.first_emi_date from public.loans l
     join public.customers c on c.id = l.customer_id where c.account_no = 'EMP-1'),
  (current_date - interval '3 months')::date,
  'create_customer: first EMI defaults to one month after purchase'
);

select lives_ok(
  format($$ select public.create_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer', jsonb_build_object('account_no','FEMI-1','first_name','Custom','bank_id','33333333-3333-3333-3333-333333333333'),
      'loan', jsonb_build_object('principal_paise',10000000,'emi_paise',500000,'tenure_months',12,
                                 'purchase_date',(current_date - interval '6 months')::text,
                                 'first_emi_date',(current_date - interval '2 months')::text)
    )::text),
  'create_customer: accepts an explicit first EMI date'
);
select is(
  (select l.first_emi_date from public.loans l
     join public.customers c on c.id = l.customer_id where c.account_no = 'FEMI-1'),
  (current_date - interval '2 months')::date,
  'create_customer: an explicit first EMI date overrides the default'
);

-- ===========================================================================
-- 8. Phase 4.5 — invoice numbers + payment_receipt().
-- A receipt is a historical document: reprinting installment #1 after two
-- payments must still read "Paid 1 of 12", not today's count.
-- ===========================================================================
select lives_ok(
  format($$ select public.create_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer', jsonb_build_object('account_no','RCP-1','first_name','Receipt','bank_id','33333333-3333-3333-3333-333333333333'),
      'loan', jsonb_build_object('principal_paise',6000000,'emi_paise',500000,'tenure_months',12,
                                 'purchase_date',(current_date - interval '3 months')::text)
    )::text),
  'create_customer: seeds the receipt fixture'
);

select public.log_payment(jsonb_build_object(
  'customer_id', (select id from public.customers where account_no = 'RCP-1'),
  'month_no', 1, 'installment_paise', 500000, 'penalty_paise', 50000,
  'receipt_no', 'R-001', 'paid_at', (current_date - interval '2 months')::text));
select public.log_payment(jsonb_build_object(
  'customer_id', (select id from public.customers where account_no = 'RCP-1'),
  'month_no', 2, 'installment_paise', 500000,
  'paid_at', (current_date - interval '1 month')::text));

select isnt(
  (select pm.invoice_no from public.payments pm
     join public.loans l on l.id = pm.loan_id
     join public.customers c on c.id = l.customer_id
    where c.account_no = 'RCP-1' and pm.month_no = 1),
  null,
  'log_payment: stamps a printable invoice number'
);

select is(
  (select (public.payment_receipt(pm.id)->>'pending_count')::int
     from public.payments pm
     join public.loans l on l.id = pm.loan_id
     join public.customers c on c.id = l.customer_id
    where c.account_no = 'RCP-1' and pm.month_no = 2),
  10,
  'payment_receipt: pending count is tenure minus installments paid'
);
select is(
  (select (public.payment_receipt(pm.id)->>'paid_count')::int
     from public.payments pm
     join public.loans l on l.id = pm.loan_id
     join public.customers c on c.id = l.customer_id
    where c.account_no = 'RCP-1' and pm.month_no = 1),
  1,
  'payment_receipt: a reprint shows the count as of that payment, not today'
);
select is(
  (select (public.payment_receipt(pm.id)->'payment'->>'total_paise')::bigint
     from public.payments pm
     join public.loans l on l.id = pm.loan_id
     join public.customers c on c.id = l.customer_id
    where c.account_no = 'RCP-1' and pm.month_no = 1),
  550000::bigint,
  'payment_receipt: total is installment + penalty'
);

-- ===========================================================================
-- 9. Phase 4.5 — update_customer() (the Edit button).
-- Employees have no RLS UPDATE policy; the security-definer RPC is what lets
-- them edit, and its own role/branch checks are the real gate.
-- ===========================================================================
select lives_ok(
  format($$ select public.update_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer_id', (select id from public.customers where account_no = 'EMP-1'),
      'customer', jsonb_build_object('account_no','EMP-1','first_name','Emp',
                                     'address_village','Wagholi',
                                     'bank_id','33333333-3333-3333-3333-333333333333')
    )::text),
  'update_customer: an employee can edit a customer in their own branch'
);
select is(
  (select address_village from public.customers where account_no = 'EMP-1'),
  'Wagholi',
  'update_customer: the change is persisted'
);

select throws_like(
  format($$ select public.update_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer_id', (select id from public.customers where account_no = 'EMP-1'),
      'customer', jsonb_build_object('account_no','SUB-1','first_name','Emp',
                                     'bank_id','33333333-3333-3333-3333-333333333333')
    )::text),
  '%already exists%',
  'update_customer: taking another customer''s account number is rejected'
);

select throws_like(
  format($$ select public.update_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer_id', (select id from public.customers where account_no = 'RCP-1'),
      'customer', jsonb_build_object('account_no','RCP-1','first_name','Receipt',
                                     'bank_id','33333333-3333-3333-3333-333333333333'),
      'loan', jsonb_build_object('tenure_months', 1)
    )::text),
  '%Tenure cannot be less than%',
  'update_customer: tenure cannot drop below the installments already recorded'
);

-- A customer that lives in Branch A, edited by the Branch B employee.
select throws_like(
  format($$ select public.update_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer_id', 'd0000000-0000-0000-0000-000000000001',
      'customer', jsonb_build_object('account_no','G1','first_name','Green',
                                     'bank_id','33333333-3333-3333-3333-333333333333')
    )::text),
  '%not found in your branch%',
  'update_customer: cross-branch edits are rejected'
);

select set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}', true);
select throws_like(
  format($$ select public.update_customer(%L::jsonb) $$,
    jsonb_build_object(
      'customer_id', (select id from public.customers where account_no = 'EMP-1'),
      'customer', jsonb_build_object('account_no','EMP-1','first_name','Owner edit',
                                     'bank_id','33333333-3333-3333-3333-333333333333')
    )::text),
  '%cannot edit customers%',
  'update_customer: the owner stays read-only'
);

select * from finish();
rollback;
