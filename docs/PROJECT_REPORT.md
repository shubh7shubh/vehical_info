# Vehicle Finance Loan Management System — 7-Day Phased Build Plan

## Context

The client needs a production web app to replace ~5,000 physical loan records (PRD_VehicleFinance_v2.md) within 6–7 days. The stack is locked (SystemDesign_VehicleFinance.md): **Next.js 14 App Router + Supabase + Vercel + cron-job.org**, all on free tier with documented upgrade paths. The directory is empty — we are initializing the project from scratch and there is no GitHub repo yet.

The build is sliced into **7 phases (one per day)**. Every phase ends with **something demoable to the client at a live Vercel preview URL**, so the client always has tangible progress to react to. Phases can be combined on faster days; later phases assume earlier ones are merged.

---

## Guiding Principles (apply in every phase)

- **Database-first business logic.** Penalty math, audit logging, soft-delete, sub-ID range checks, foreclosure calc, daily summary, pending list, bank recovery — all live as Postgres triggers / RPC functions. Next.js routes stay thin: validate → auth → `supabase.rpc()` → return.
- **No Edge runtime, no Vercel Cron** (Vercel free has no cron — using cron-job.org). All API routes are standard Node.js handlers.
- **RLS enforced at the DB level**, not just in UI — Admin / Employee / Sub-ID separation must hold even if a route handler is buggy.
- **Soft delete only** in v1; every write goes through the audit_log trigger.
- **Every phase ships a Vercel preview URL.** Client sees progress daily.

---

## Repository Setup (do once, before Phase 1 work)

1. `npx create-next-app@latest banking-app --ts --app --tailwind --eslint --src-dir=false --import-alias="@/*"`
2. `git init` + first commit (no GitHub remote yet — Vercel can deploy from a local git or we push to a new GitHub repo on Day 1; recommend creating a private GitHub repo on Day 1 since Vercel's nicest workflow is GitHub-connected previews).
3. Install: `@supabase/supabase-js @supabase/ssr zod react-hook-form lucide-react date-fns sonner`
4. Add shadcn/ui (`npx shadcn@latest init`) — covers form, table, dialog, badge, toast, tabs, dropdown.
5. Create Supabase project (free tier, region: closest to client — likely Mumbai/Singapore).

---

## Phase 1 — Day 1: Project Init + Live Vercel Link ✅ SHIPPED (2026-05-07)
**Demo URL:** Vercel preview being connected · Repo: `github.com/shubh7shubh/vehical_info`

**What shipped:**
- Next.js 16.2.5 (App Router) + Tailwind v4 + TypeScript scaffolded into repo root
- Brand tokens for Bank A (blue) / Bank B (green) — names swappable when client confirms (PRD Open Q #8)
- `/login` UI shell — branded sign-in form, button intentionally disabled (auth wires in Phase 2)
- `/dashboard` skeleton — header strip with 5 stats slots + 4 quick-access tiles (Pending, Bank Recovery, Daily Summary, Total Customers) per PRD §3.1
- `lib/supabase/server.ts` + `client.ts` via `@supabase/ssr` — placeholder env wired
- `middleware.ts` stub (Phase 2 will rename to `proxy.ts` per Next 16 convention and add session refresh + role gating)
- `CLAUDE.md` with hard architectural rules (no Edge runtime, no Vercel Cron, DB-first business logic, RLS mandatory, soft-delete only)
- `.env.local.example` with Supabase URL pre-filled, service role + anon + CRON_SECRET placeholders
- Local `.env.local` populated with real Supabase keys (gitignored)
- `next build` passes; routes `/`, `/login`, `/dashboard` generated

**Critical files shipped:**
- `app/(auth)/login/page.tsx`
- `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`
- `app/page.tsx` (redirects `/` → `/login`)
- `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/utils.ts`
- `middleware.ts` (stub)
- `CLAUDE.md`, `.env.local.example`, `docs/`

**Outstanding for Day 1 demo:** Vercel project import + env-var paste (user owns this).

---

## Phase 2 — Day 2: Auth + Schema + RLS + Role-Gated Dashboard 🚧 IN PROGRESS (2026-05-07)
**Demo:** Real admin / employee / sub-ID login with role-appropriate dashboards. Audit log automatically captures every DB write. Forbidden actions fail at the database (RLS), not just the UI.

### Defaults Applied (until client confirms PRD §8)
- Penalty default: `per_day` ₹50 (Open Q #2)
- Grace period default: 2 days (Open Q #7)
- Bank labels: "Bank A" / "Bank B" (Open Q #8) — overwritable in seed data with no schema change

### Database Schema — `supabase/migrations/20260507120000_schema.sql`
- `app_role` enum: `admin | employee | sub_id`
- `users` (id ↔ auth.users, email, role, sub_id_range_start/end, disabled_at)
- `banks` (id, name, color, created_at)
- `customers` (id, first_name, middle_name, last_name, address_taluka, address_village, mobiles text[], aadhaar, bank_id, created_by, created_at, updated_at, deleted_at)
- `vehicles` (customer_id, vehicle_name, rc_no UNIQUE, engine_no_1, engine_no_2, chassis_no)
- `guarantors` (customer_id, name, mobile, address)
- `loans` (id, customer_id, principal_paise, emi_paise, tenure_months, due_day, grace_days, penalty_type, penalty_rate_paise, status, started_at, closed_at)
- `payments` (id, loan_id, amount_paise, mode, utr, paid_at, recorded_by)
- `penalties` (id, loan_id, period_start, period_end, amount_paise, waived_by, waived_at)
- `seizures` (id, customer_id, amount_paise, notes, status, created_by, approved_by)
- `foreclosures` (id, loan_id, calculated_at, original_interest_paise, bank_charge_paise, final_payable_paise, paid_at, noc_issued_at)
- `documents_keys` (customer_id PK, key_status, key_handover_date, doc_status, doc_handover_date, bank_doc_status)
- `audit_log` (id, user_id, action, table_name, record_id, old_value jsonb, new_value jsonb, at)

All money stored as integer **paise** (avoid float). All FKs use `on delete restrict` — soft-delete is the only delete path.

### RLS Policies — `supabase/migrations/20260507120100_rls.sql`
Enabled on every table; policies map to PRD §5:
- Admin → full read/write everywhere
- Employee → read all (UTR masked via RPC return shape, not RLS); insert customers, vehicles, guarantors, loans, payments; **cannot** edit penalties, foreclosures, seizures (pending state), users
- Sub-ID → INSERT-only on customers/vehicles/guarantors, scoped to assigned numeric range, blocked when `disabled_at IS NOT NULL`

### Triggers — `supabase/migrations/20260507120200_triggers.sql`
- `audit_log_trigger()` — fires `AFTER INSERT/UPDATE/DELETE` on every table; captures `auth.uid()`, action, before/after as jsonb
- `handle_new_auth_user()` — `AFTER INSERT` on `auth.users` → creates matching `public.users` row with default role `employee`
- `set_updated_at()` — generic timestamp trigger applied to mutable tables
- `enforce_soft_delete()` pattern — DELETE intercepted, sets `deleted_at` instead

### Seed — `supabase/migrations/20260507120300_seed.sql`
- Inserts Bank A + Bank B with default colors
- Includes (commented) snippet to promote first user to admin: `update public.users set role='admin' where email='you@example.com';`

### App Wiring
- Rename `middleware.ts` → `proxy.ts` (Next 16) with Supabase session refresh + role gates: `/dashboard/admin/*` → admin only, `/dashboard/*` → any authenticated, `/login` → redirect away if already authed
- Login form converted to server action calling `supabase.auth.signInWithPassword`
- Logout button in dashboard header
- `lib/auth/current-user.ts` → `getCurrentUser()` returns `{ user, role, disabled, subIdRange }` from joined `auth.users` + `public.users`
- Dashboard nav reflects role; `/dashboard/admin` page stub created with placeholder for sub-ID + employee management (built out in Phase 6)

### How to Apply Migrations
1. Open Supabase Dashboard → SQL Editor
2. Run each migration file in order: `20260507120000_schema.sql` → `20260507120100_rls.sql` → `20260507120200_triggers.sql` → `20260507120300_seed.sql`
3. Create first user in **Authentication → Users → Add user** (email + password)
4. Run the admin-promotion snippet from the seed file with that user's email
5. Log into `/login` on Vercel preview — should land on admin dashboard

### Demoable Proof
- Log in as admin → full nav visible (Customers / Pending / Recovery / Summary / Admin)
- Create a second user, leave role as default `employee` → log in → no Admin nav, RLS blocks any update to penalties via direct REST API
- Open Supabase SQL Editor → `select * from audit_log` shows rows for every action taken

---

## Phase 3 — Day 3: Customer Management + Smart Search + Customer Card
**Demo:** Add new customer, search by name/RC/engine/mobile/Aadhaar, open full customer card with Customer/Guarantor/Vehicle details.

- Onboarding form (server action) with validation + duplicate detection on RC + engine number.
- Smart search bar in dashboard header → calls `search_customers(query)` RPC (uses Postgres trigram + ILIKE).
- Disambiguation list when name collides (PRD AC-03).
- Customer card page: Customer / Guarantor / Vehicle / Loan summary / EMI history / Foreclosure-Seizure status / Docs-Keys section. Use **tabs** (mobile-friendly — pending Open Question #4).
- "Record incomplete" warning badge when engine_no fields are missing.

---

## Phase 4 — Day 4: Payment Logging + Auto Penalty Engine + Pending List
**Demo:** Log a payment → penalty auto-calculated. Pending list filters (0/1/3/5/Below 3/Above 5) all work.

- Payment entry form (cash / online + UTR field, with masking logic for employees).
- **DB trigger `apply_penalty_on_payment()`** on payments insert/update — implements grace + penalty math per loan config.
- **`pg_cron` daily sweep** at 18:30 UTC running `run_penalty_sweep()` — picks up loans where no payment was logged.
- **`get_pending_customers(filter)`** RPC powering the pending list page.
- Penalty visible on customer card; Admin can edit/waive (gated for Phase 6 OTP — for now just admin-only without OTP).

---

## Phase 5 — Day 5: Bank Recovery + Daily Summary + Foreclosure + Seizure
**Demo:** Two color-coded bank recovery lists, end-of-day summary screen, foreclosure calculator, seizure entry with admin approval state.

- `get_bank_recovery_list(bank_id)` RPC; auto grow/shrink as customers added/closed.
- `get_daily_summary(date)` RPC: cash list, online list (UTR masked for employees), totals, pending, penalty totals.
- `calculate_foreclosure(loan_id)` RPC: remaining months, original interest, reduction, bank charge, final payable.
- Seizure module: employee creates entry → status `pending` → Admin approves (OTP comes in Phase 6).
- NOC + key handover status visible on foreclosure screen.

---

## Phase 6 — Day 6: OTP Gating + Sub-IDs + Audit Log + Soft Delete + Docs/Keys
**Demo:** Admin actions (penalty edit, foreclosure, seizure approval) require email OTP. Sub-ID accounts can only insert within their assigned range. Deleted records show in a recovery view.

- Email OTP flow via Supabase Auth: `/api/auth/otp` issues, RPC verifies token before mutation.
- `validate_sub_id_range()` trigger on customers insert; auto-disable sub_id account when range filled (RPC `mark_sub_id_complete`).
- Admin sub-ID management page: create / monitor progress / disable.
- Audit log trigger wired on every table; admin-only audit log view.
- Soft-delete trigger (sets `deleted_at`); 30-day recovery UI for Admin.
- Documents & Key handling section editable by Admin, view-only for Employee.

---

## Phase 7 — Day 7: Realtime, cron-job.org, PWA Polish, UAT
**Demo:** Run through all 12 PRD acceptance criteria with the client. Live updates across tabs.

- Supabase Realtime on dashboard counters (pending counts, daily summary totals) and bank recovery lists.
- `/api/health` (cron-job.org daily ping to keep Supabase awake) + `/api/penalty` fallback (only used if `pg_cron` is disabled).
- Configure cron-job.org with `CRON_SECRET` header.
- Mobile responsiveness sweep + PWA manifest (Open Question #9 — PWA in v1).
- Performance: paginate customer list, add Postgres indexes (rc_no, engine_no, mobiles, full_name trigram).
- UAT walkthrough against PRD §9 AC-01 to AC-12 with the client; track pass/fail in a checklist.

---

## CLAUDE.md (proposed content for repo root)

```markdown
# Vehicle Finance Loan Management System

Internal ops platform replacing physical loan books for ~5,000 customers.
Source of truth: `PRD_VehicleFinance_v2.md`, `SystemDesign_VehicleFinance.md`.

## Stack
- Next.js 14 App Router (TypeScript, Tailwind, shadcn/ui)
- Supabase: Postgres + Auth + RLS + Realtime + pg_cron
- Vercel (Hobby) deployment, cron-job.org for anti-pause + penalty fallback

## Hard Architectural Rules
- **No Edge runtime.** Never use `export const runtime = 'edge'`. All routes are standard Node.js.
- **No Vercel Cron** (not on Hobby). Use cron-job.org or `pg_cron` inside Supabase.
- **Business logic lives in Postgres.** Penalty calc, audit logging, soft-delete,
  sub-ID range check, foreclosure, daily summary, pending list, bank recovery
  are DB triggers / RPC functions. API routes only validate, check auth, call
  `supabase.rpc()`, return.
- **RLS is mandatory** on every table — never rely on UI/middleware alone for access.
- **Soft delete only.** Every table has `deleted_at`; never hard delete in v1.
- **Audit log trigger** runs on every INSERT/UPDATE/DELETE.
- **OTP-gated admin actions:** penalty edit/waive, foreclosure, seizure approval.

## Roles
- `admin` — full access, sees full UTR, manages sub-IDs, approves OTP-gated actions
- `employee` — add customers, log payments, view (UTR masked), no penalty edits
- `sub_id` — temporary, INSERT-only, scoped to assigned record-range, auto-disabled

## Folder Layout
- `app/api/*` — thin route handlers (Node runtime)
- `app/(auth)/*`, `app/(dashboard)/*` — UI route groups
- `lib/supabase/{server,client}.ts` — typed clients
- `lib/utils/*` — formatters, masking helpers
- `supabase/migrations/*.sql` — schema, RLS, triggers, RPCs (source of truth)

## Conventions
- Server actions for forms; Route handlers for cron + JSON APIs
- All money fields stored as integer paise (avoid float)
- All timestamps UTC; render IST in UI
- Bulk entry: ≤50 records per request (Vercel Hobby 10s timeout)
- UTR masked client-side for employees AND server-side via RPC return shape

## Open Questions Tracked in PRD §8
Defer answers but design flexibly for: penalty per-customer config (#2),
search scope (#3), grace period (#7), bank names (#8), export formats (#5).
```

---

## Verification Strategy

- **Per phase:** Click through Vercel preview, verify the day's demo. No phase ships without a working preview URL.
- **Per RPC / trigger:** Test directly in Supabase SQL Editor with seed rows before wiring to UI.
- **Phase 7 UAT:** Walk PRD §9 AC-01 through AC-12 with the client; capture pass/fail; fix blockers same-day.
- **RLS verification:** Log in as each role in different browsers and confirm forbidden actions fail server-side, not just in UI.
- **Realtime check:** Two browser tabs as same admin → action in tab A reflects in tab B without reload.

---

## Critical Files to Create / Modify (cross-phase)

- `app/api/customers/route.ts`, `app/api/customers/[id]/route.ts`
- `app/api/payments/route.ts`
- `app/api/foreclosure/route.ts`, `app/api/seizure/route.ts`
- `app/api/daily-summary/route.ts`
- `app/api/auth/otp/route.ts`
- `app/api/health/route.ts`, `app/api/penalty/route.ts`
- `app/(dashboard)/customers/[id]/page.tsx` — customer card
- `app/(dashboard)/pending/page.tsx`, `app/(dashboard)/recovery/page.tsx`, `app/(dashboard)/summary/page.tsx`
- `app/(dashboard)/admin/sub-ids/page.tsx`, `app/(dashboard)/admin/audit/page.tsx`
- `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_triggers.sql`, `0004_rpcs.sql`, `0005_pg_cron.sql`
- `middleware.ts` — session + role gate
- `lib/utils/penalty.ts`, `lib/utils/utr-mask.ts`, `lib/utils/money.ts`
- `CLAUDE.md`, `.env.local.example`

---

## Risks / Things to Flag Early

1. **PRD §8 Open Questions #2, #3, #7, #8 are blockers** — get answers Day 1 to avoid rework on penalty config, bank labels, grace period.
2. **Vercel Hobby 10s timeout** — bulk historical entry must batch ≤50 records (system design §4).
3. **Free-tier Supabase pause** — cron-job.org ping must be live by Day 7 or sooner.
4. **OTP UX on shared admin email** — confirm if multiple admins use one email or separate; affects flow.
5. **Mobile testing** — must test on actual phones, not only browser devtools, before Phase 7 sign-off.
