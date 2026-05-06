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

## Phase 1 — Day 1: Project Init + Live Vercel Link
**Demo:** A live URL with the app's branded login screen + a "coming soon" dashboard skeleton.

- Initialize Next.js 14 App Router project as above.
- Add Tailwind + shadcn/ui base, set up brand theme tokens (two colors reserved for the two banks — placeholder names until Open Question #8 is answered).
- Build login page UI shell (no backend yet) and a logged-in dashboard skeleton with the 4 quick-access tiles + header strip from PRD §3.1.
- Push to GitHub (private repo).
- Connect to Vercel → deploy → share preview URL with client.
- Wire env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

**Critical files created:**
- `app/(auth)/login/page.tsx`
- `app/(dashboard)/layout.tsx`, `app/(dashboard)/page.tsx`
- `lib/supabase/server.ts`, `lib/supabase/client.ts`
- `middleware.ts` (stub — will gate in Phase 2)
- `CLAUDE.md` (see content draft below)

---

## Phase 2 — Day 2: Auth + Schema + RLS + Role-Gated Dashboard
**Demo:** Admin and Employee can log in; each sees a role-appropriate dashboard. Sub-ID account opens a restricted entry screen only.

**Database schema (Supabase SQL Editor):**
- `users` (id, email, role: `admin|employee|sub_id`, sub_id_range_start, sub_id_range_end, disabled_at)
- `banks` (id, name, color)
- `customers` (id, full_name fields, address, mobiles[], aadhaar, bank_id, created_by, created_at, deleted_at)
- `vehicles` (customer_id, name, rc_no UNIQUE, engine_no_1, engine_no_2, chassis_no)
- `guarantors` (customer_id, name, mobile, address)
- `loans` (id, customer_id, principal, emi_amount, tenure_months, due_day, grace_days, penalty_type: `per_day|monthly_fixed`, penalty_rate, status)
- `payments` (id, loan_id, amount, mode: `cash|online`, utr, paid_at, recorded_by)
- `penalties` (id, loan_id, period_start, period_end, amount, waived_by, waived_at)
- `seizures` (id, customer_id, amount, notes, status: `pending|active|resolved`, approved_by)
- `foreclosures` (id, loan_id, calculated_at, original_interest, bank_charge, final_payable, paid_at, noc_issued_at)
- `documents_keys` (customer_id, key_status, key_handover_date, doc_status, doc_handover_date, bank_doc_status)
- `audit_log` (id, user_id, action, table, record_id, old_value jsonb, new_value jsonb, at)

**RLS policies** for each table per role matrix (PRD §5).
**Auth:** Supabase email/password + OTP via `@supabase/ssr`. Middleware enforces role-based route access server-side.

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
