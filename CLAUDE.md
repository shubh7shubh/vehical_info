# Vehicle Finance Loan Management System

Internal ops platform replacing physical loan books for ~5,000 customers.
Source of truth: `docs/PRD_VehicleFinance_v2.md`, `docs/SystemDesign_VehicleFinance.md`,
`docs/PROJECT_REPORT.md` (7-day phase plan).

## Stack
- Next.js 16 App Router (TypeScript, Tailwind v4)
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
- `app/(auth)/login/*`, `app/dashboard/*` — UI
- `lib/supabase/{server,client}.ts` — typed clients (`@supabase/ssr`)
- `lib/utils.ts` — `cn()`, money + UTR formatters
- `supabase/migrations/*.sql` — schema, RLS, triggers, RPCs (source of truth, lands in Phase 2)

## Conventions
- Server actions for forms; Route handlers for cron + JSON APIs
- Money stored as integer paise (avoid float)
- Timestamps stored UTC; rendered in IST
- Bulk entry: ≤50 records per request (Vercel Hobby 10s timeout)
- UTR masked client-side AND server-side via RPC return shape for employees

## Environment Variables
See `.env.local.example`. Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose)
- `CRON_SECRET` (header secret for cron-job.org → /api/health and /api/penalty)

## Open Questions Tracked in PRD §8
Defer answers but design flexibly for: penalty per-customer config (#2),
search scope (#3), grace period (#7), bank names (#8), export formats (#5).

## Build Phase Status
- [x] Phase 1 — Project init + Vercel link + UI skeleton
- [ ] Phase 2 — Auth + DB schema + RLS + role-gated dashboard
- [ ] Phase 3 — Customer mgmt + smart search + customer card
- [ ] Phase 4 — Payments + auto penalty + pending list
- [ ] Phase 5 — Bank recovery + daily summary + foreclosure + seizure
- [ ] Phase 6 — OTP gating + sub-IDs + audit log + soft delete + docs/keys
- [ ] Phase 7 — Realtime + cron-job.org + PWA + UAT
