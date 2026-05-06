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
- `admin` — full access, sees full UTR, manages users + sub-IDs, approves OTP-gated actions
- `employee` — add customers, log payments, view (UTR masked), no penalty edits, can create
  seizures in `pending` state (admin approves)
- `sub_id` — temporary, INSERT-only, scoped to assigned record-range, auto-disabled when
  range is exhausted; sees a stripped-down "Bulk Data Entry" UI only

## Folder Layout
- `app/(auth)/login/page.tsx` + `actions.ts` — login form + `loginAction` / `logoutAction`
- `app/dashboard/*` — admin/employee dashboard (proxy-gated)
- `app/dashboard/admin/*` — admin-only routes (proxy-gated by role)
- `app/dashboard/admin/users/{page,actions}.tsx` — user management panel (Phase 2.5)
- `app/api/*` — thin route handlers (Node runtime) — added in Phases 4–7
- `lib/supabase/server.ts` — `createSupabaseServerClient()` (anon, cookie-aware via `@supabase/ssr`)
- `lib/supabase/client.ts` — browser client
- `lib/supabase/admin.ts` — **service-role** client (`"server-only"`); use only inside
  server actions / server components for admin-tier operations
- `lib/auth/current-user.ts` — `getCurrentUser()`, `requireUser()`, `requireAdmin()`
- `lib/utils.ts` — `cn()`, `formatINR()`, `maskUTR()`
- `proxy.ts` — Next 16 proxy (replaces `middleware.ts`); session refresh + role gating
- `supabase/migrations/YYYYMMDDHHMMSS_*.sql` — schema, RLS, triggers, RPCs (source of truth)
- `supabase/config.toml` — `supabase init` config; lets us run `npx supabase db push`
- `scripts/create-admin.mjs` — one-shot bootstrap admin provisioner via service role key
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
- [ ] **Phase 3** — Customer mgmt + smart search + customer card
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
