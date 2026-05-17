# Vehicle Finance Loan Management System

Internal ops platform replacing physical loan books for ~5,000 customers.
Source of truth: `docs/PRD_VehicleFinance_v2.md`, `docs/SystemDesign_VehicleFinance.md`,
`docs/PROJECT_REPORT.md` (7-day phase plan + status), `docs/TESTING.md` (developer
test walkthrough), `docs/CLIENT_TESTING.md` (client-facing test plan).

## Stack
- **Next.js 16.2** App Router (TypeScript, Tailwind v4 — CSS-first config in `app/globals.css`)
- **Supabase**: Postgres + Auth (email/password + OTP) + RLS + Realtime + pg_cron
- **Vercel** (Hobby) — auto-deploy from `main` on `github.com/shubh7shubh/vehical_info`
- **cron-job.org** — daily anti-pause ping + penalty sweep fallback (Phase 7)

> No shadcn/ui. We use Tailwind v4 directly with brand tokens in `app/globals.css`.

## Hard Architectural Rules
- **No Edge runtime.** Never use `export const runtime = 'edge'`. All routes are standard Node.js.
- **No Vercel Cron** (not on Hobby). Use cron-job.org or `pg_cron` inside Supabase.
- **Business logic lives in Postgres.** Penalty calc, audit logging, soft-delete,
  sub-ID range check, foreclosure, daily summary, pending list, bank recovery
  are DB triggers / RPC functions. API routes / server actions only validate,
  check auth, call `supabase.rpc()`, return.
- **RLS is mandatory** on every table — never rely on UI/middleware alone for access.
- **Soft delete only.** Every table has `deleted_at`; never hard delete in v1.
- **Audit log trigger** runs on every INSERT/UPDATE/DELETE across every table.
- **OTP-gated admin actions:** penalty edit/waive, foreclosure, seizure approval (Phase 6).
- **Service role key is server-only.** Imported only from `"use server"` action files
  or server components. `lib/supabase/admin.ts` includes `import "server-only"` to enforce this.

## Roles
- `owner` — single global super-admin; oversees every branch; `branch_id` is NULL;
  read-only drill-down into any branch; the only role that creates/manages branches
- `admin` — full access **within one branch**, sees full UTR, manages that branch's
  users + sub-IDs, approves OTP-gated actions
- `employee` — add customers, log payments, view (UTR masked), no penalty edits, can create
  seizures in `pending` state (admin approves) — all **scoped to their branch**
- `sub_id` — temporary, INSERT-only, scoped to assigned record-range **within a branch**,
  auto-disabled when range is exhausted; sees a stripped-down "Bulk Data Entry" UI only

> `admin`, `employee`, `sub_id` each belong to exactly one branch (`users.branch_id`).
> `owner` belongs to none. See `## Branches` below.

## Branches
One company, many branches (Phase 2.7). There is no "companies" table — the company
is implicit, represented by the `owner`.
- `public.branches` is the tenant unit; every operational table carries a
  `branch_id` (NOT NULL) and is RLS-scoped to it. `banks` is the exception —
  it stays **company-wide / global**, no `branch_id`.
- An `admin`/`employee`/`sub_id` only ever sees their own branch's rows; the `owner`
  reads every branch but cannot write operational data (read-only at the DB layer).
- **Every new Phase 3+ table MUST:** (1) have `branch_id uuid not null references
  branches(id)`, (2) register a `<table>_set_branch_id` before-insert trigger,
  (3) add a `<table>_branch_idx` index, (4) ship branch-scoped RLS plus a
  `<table>_owner_read` select policy. RLS helpers: `is_owner()`, `current_branch_id()`.

## Folder Layout
- `app/(auth)/login/page.tsx` + `actions.ts` — login form + `loginAction` / `logoutAction`
- `app/dashboard/*` — admin/employee dashboard (proxy-gated)
- `app/dashboard/admin/*` — admin-only routes (proxy-gated by role)
- `app/dashboard/admin/users/{page,actions}.tsx` — branch-scoped user management (Phase 2.5/2.7)
- `app/dashboard/owner/*` — owner-only area (proxy-gated): cross-branch stats,
  `owner/branches/{page,actions}.tsx` branch CRUD, `owner/branches/[branchId]` drill-down
- `app/api/*` — thin route handlers (Node runtime) — added in Phases 4–7
- `lib/supabase/server.ts` — `createSupabaseServerClient()` (anon, cookie-aware via `@supabase/ssr`)
- `lib/supabase/client.ts` — browser client
- `lib/supabase/admin.ts` — **service-role** client (`"server-only"`); use only inside
  server actions / server components for admin-tier operations
- `lib/auth/current-user.ts` — `getCurrentUser()`, `requireUser()`, `requireAdmin()`, `requireOwner()`
- `lib/utils.ts` — `cn()`, `formatINR()`, `maskUTR()`
- `proxy.ts` — Next 16 proxy (replaces `middleware.ts`); session refresh + role gating
- `supabase/migrations/YYYYMMDDHHMMSS_*.sql` — schema, RLS, triggers, RPCs (source of truth)
- `supabase/config.toml` — `supabase init` config; lets us run `npx supabase db push`
- `scripts/create-owner.mjs` — one-shot bootstrap owner provisioner via service role key
- `docs/` — PRD, SystemDesign, PROJECT_REPORT, TESTING, CLIENT_TESTING

## Conventions
- Server actions for forms (`"use server"` files); Route handlers for cron + JSON APIs
- All money stored as **integer paise** (avoid float)
- All timestamps stored UTC; rendered IST in UI
- Bulk entry: ≤50 records per request (Vercel Hobby 10s timeout)
- UTR masked client-side AND server-side via RPC return shape for employees
- New migrations always use full-timestamp filenames `YYYYMMDDHHMMSS_name.sql`;
  never edit a migration that's already been pushed — write a new one
- Push migrations with `npx supabase db push` (CLI is linked to project ref `eeqyslialzgpatutsnwh`)

## Environment Variables
See `.env.local.example`. Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose)
- `CRON_SECRET` (header secret for cron-job.org → /api/health and /api/penalty)

Same four must also be set in **Vercel → Project Settings → Environment Variables**
(Production + Preview + Development).

## Open Questions Tracked in PRD §8
Defer answers but design flexibly for: penalty per-customer config (#2),
search scope (#3), grace period (#7), bank names (#8), export formats (#5).
Defaults applied: per_day ₹50, 2-day grace, "Bank A" / "Bank B" — all swappable
in `public.banks` and `public.loans` without schema change.

## Build Phase Status
- [x] **Phase 1** — Project init + Vercel link + UI skeleton
- [x] **Phase 2** — Auth + DB schema + RLS + role-gated dashboard
- [x] **Phase 2.5** — Admin user-management panel (lifted user CRUD out of Phase 6)
- [x] **Phase 2.7** — Multi-branch foundation (owner role, branches, branch-scoped RLS)
- [x] **Phase 3** — Customer mgmt + smart search + customer card (branch-scoped)
- [ ] **Phase 4** — Payments + auto penalty + pending list
- [ ] **Phase 5** — Bank recovery + daily summary + foreclosure + seizure
- [ ] **Phase 6** — OTP gating + sub-ID monitoring + audit log viewer + soft-delete recovery + docs/keys
- [ ] **Phase 7** — Realtime + cron-job.org + PWA + UAT

## Client-Facing UI Rules
- **No phase / version / "preview" labels** in UI shown to the client. Internal
  status lives in `docs/PROJECT_REPORT.md` only.
- Login is the entry point; `/` redirects to `/login`.
- Sub-ID role gets a stripped-down `/dashboard` (no nav, no tiles) — never expose
  the full nav to a sub-ID account.
- Owner role lands on `/dashboard/owner` (cross-branch) with its own nav
  (Dashboard, Branches) — never the operational branch nav.
- **Loading state on every Server Action.** Use `<SubmitButton>` from
  `components/submit-button.tsx` (wraps `useFormStatus()`) for any button that
  submits a server action. Never ship a plain `<button type="submit">` for a
  server action — clicks feel like the page hung.
- **Mobile-first responsive — every feature must be fully usable on a phone.**
  - The app is used in the field on mobile devices, not just desktops.
  - Test every page at 375px / 414px / 768px before shipping. No nav link, button,
    table column, or form input may be hidden behind `hidden md:*` without an
    equivalent mobile affordance (hamburger menu, dropdown, horizontal scroll
    container, etc.).
  - Dashboard top-nav must be reachable on mobile. Tables wider than the viewport
    must scroll horizontally inside their container, never overflow the page.
  - Form inputs use 16px+ font-size on mobile (otherwise iOS auto-zooms on focus).
  - Touch targets ≥ 40px tall.
