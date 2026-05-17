-- Phase 2.7 — Multi-Branch Foundation (3/6): add `branch_id` everywhere.
--
-- Columns are added NULLABLE here; file 4 backfills then sets NOT NULL on the
-- operational tables. `banks` deliberately gets no branch_id — the bank list is
-- company-wide / shared. `audit_log.branch_id` stays permanently nullable
-- (owner actions and branch-creation events legitimately have no branch).

alter table public.users          add column branch_id uuid references public.branches(id);
alter table public.customers      add column branch_id uuid references public.branches(id);
alter table public.vehicles       add column branch_id uuid references public.branches(id);
alter table public.guarantors     add column branch_id uuid references public.branches(id);
alter table public.loans          add column branch_id uuid references public.branches(id);
alter table public.payments       add column branch_id uuid references public.branches(id);
alter table public.penalties      add column branch_id uuid references public.branches(id);
alter table public.seizures       add column branch_id uuid references public.branches(id);
alter table public.foreclosures   add column branch_id uuid references public.branches(id);
alter table public.documents_keys add column branch_id uuid references public.branches(id);
alter table public.audit_log      add column branch_id uuid references public.branches(id);

create index users_branch_idx          on public.users(branch_id);
create index customers_branch_idx      on public.customers(branch_id);
create index vehicles_branch_idx       on public.vehicles(branch_id);
create index guarantors_branch_idx     on public.guarantors(branch_id);
create index loans_branch_idx          on public.loans(branch_id);
create index payments_branch_idx       on public.payments(branch_id);
create index penalties_branch_idx      on public.penalties(branch_id);
create index seizures_branch_idx       on public.seizures(branch_id);
create index foreclosures_branch_idx   on public.foreclosures(branch_id);
create index documents_keys_branch_idx on public.documents_keys(branch_id);
create index audit_log_branch_idx      on public.audit_log(branch_id);
