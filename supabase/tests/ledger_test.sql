-- pgTAP tests for the ledger / installment-registry features.
-- Run with:  npx supabase test db   (needs the local stack — Docker)
--
-- Time is SIMULATED, never waited for: a customer's overdue status is derived
-- from purchase_date vs. today, so we backdate purchase_date (and seed a real
-- payment history) to reproduce "3 months behind" instantly. This is the same
-- trick to use for manual testing — set the purchase date in the past.

begin;
select plan(16);

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

select * from finish();
rollback;
