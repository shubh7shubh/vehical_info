# System Design Summary
## Vehicle Finance Loan Management System

> Reference document for development. Decisions are final unless explicitly revised.
> The system is designed to start on **fully free infrastructure** and can be upgraded to paid plans at any point — no architecture changes required. Upgrade paths are documented in Section 8 & 9.

---

## 1. Stack Overview

| Layer | Technology | Free Plan | Pro Plan |
|---|---|---|---|
| **Framework** | Next.js 14 (App Router) | — | — |
| **Hosting** | Vercel | Hobby — Free | Pro — $20/month |
| **Database** | Supabase | Free Tier | Pro — $25/month |
| **Scheduler** | cron-job.org | Free (always) | — not needed |
| **Domain** | Namecheap / GoDaddy | ~₹800/year | same |

**Starting Cost: ₹0/month** (domain ~₹800/year only)
**Full Pro Cost: ~$45/month (~₹3,800/month)** if both Vercel and Supabase are upgraded

> Both Vercel and Supabase are **drop-in upgrades** — no code changes, no migration, no redeployment needed. You simply upgrade the plan in their respective dashboards and the same codebase runs with better limits instantly.

---

## 2. Architecture Pattern

```
Browser / Mobile
      │
      ▼
  Vercel (Next.js)
  ┌─────────────────────────────┐
  │  App Router (Frontend UI)   │
  │  Route Handlers (API)       │
  │  Server Actions (Forms)     │
  └────────────┬────────────────┘
               │
               ▼
        Supabase (BaaS)
  ┌─────────────────────────────┐
  │  Postgres (main database)   │
  │  Auth (OTP + sessions)      │
  │  Row Level Security (RLS)   │
  │  Realtime (live dashboard)  │
  │  Storage (documents v2+)    │
  └─────────────────────────────┘
               ▲
               │
        cron-job.org
  ┌─────────────────────────────┐
  │  Daily ping → /api/health   │  ← keeps Supabase from pausing
  │  Daily ping → /api/penalty  │  ← triggers auto penalty engine
  └─────────────────────────────┘
```

- **No separate backend project.** All API logic lives inside Next.js Route Handlers under `/app/api/`
- **No Express, no FastAPI, no separate server.** Vercel runs standard Node.js route handlers only.
- **No Edge Functions. No Serverless Functions.** All Next.js routes run as standard Node.js — predictable, debuggable, no cold-start surprises.
- **No Vercel Cron needed.** cron-job.org replaces it at zero cost.
- **Heavy business logic lives in the database** — Supabase Database Triggers and RPC Functions handle penalty calculation, audit logging, foreclosure math, and summary aggregation. Next.js API routes are thin — they authenticate, call an RPC, and return the result.

---

## 3. Key Technical Decisions

### 3.1 Full-Stack Next.js — Standard Node.js Only (No Edge / No Serverless)
- All API routes live in `/app/api/[route]/route.ts` as standard **Node.js Route Handlers**
- **No Edge Functions** — Edge runtime is unpredictable, has limited Node.js API support, and adds unnecessary complexity for this use case
- **No Serverless-specific patterns** — no splitting logic across Lambda-style functions; every route is a simple, readable handler
- Server Actions used for straightforward form submissions (new customer, log payment, etc.)
- Middleware used only for session checks and role enforcement before page render — kept minimal
- **API routes are intentionally thin** — they validate the request, check auth, call a Supabase RPC function, and return the result. No heavy logic in the route handler itself.
- Justification: ~20 concurrent users, 5,000 records — simplicity and debuggability matter more than scaling patterns

### 3.2 Supabase — Database Triggers & RPC Functions for All Business Logic
This is the core architectural decision. Instead of writing business logic in Next.js API routes, all complex operations are written as **Postgres functions** and called via Supabase's `rpc()` client. This means:
- Logic runs inside the database — faster, no network round trips, no cold starts
- Business rules are enforced even if the app layer has a bug or is temporarily down
- Easier to test and audit directly in Supabase SQL editor

**What lives in the database (Triggers & RPC):**

| Operation | Type | Description |
|---|---|---|
| Auto penalty calculation | **DB Trigger** | Fires on payment table insert/update — checks due date + grace period, writes penalty row automatically |
| Audit log writing | **DB Trigger** | Fires on every INSERT / UPDATE / DELETE across all tables — writes to `audit_log` table automatically |
| Soft delete enforcement | **DB Trigger** | On delete attempts, sets `deleted_at` timestamp instead of removing the row |
| Sub-ID range validation | **DB Trigger** | On customer insert by a Sub-ID, checks record is within their assigned range — rejects if out of range |
| Foreclosure amount calculation | **RPC Function** | `calculate_foreclosure(customer_id)` — returns remaining months, interest, reduction, final payable |
| Daily summary aggregation | **RPC Function** | `get_daily_summary(date)` — returns cash total, online total, pending, penalty totals in one call |
| Pending customer list | **RPC Function** | `get_pending_customers(filter)` — returns filtered list with all required columns in one query |
| Bank recovery list | **RPC Function** | `get_bank_recovery_list(bank_id)` — returns full list per bank with payment status |
| Penalty override (admin) | **RPC Function** | `override_penalty(customer_id, new_amount, admin_id)` — validates OTP token, updates penalty, writes audit log |

**What Next.js API routes do (thin layer only):**
```
1. Validate incoming request (shape, required fields)
2. Verify Supabase session + user role
3. Call supabase.rpc('function_name', { params })
4. Return the result to the frontend
```

**Supabase stack used:**
- **Postgres** — primary relational data store
- **Supabase Auth** — login sessions and email OTP for admin confirmations
- **Row Level Security (RLS)** — enforces Admin / Employee / Sub-ID permissions at DB level, not just UI
- **Database Triggers** — auto-run logic on data changes (penalty, audit, soft-delete, range validation)
- **RPC Functions** — named Postgres functions called from Next.js via `supabase.rpc()`
- **Supabase Realtime** — live dashboard updates (pending counts, daily summary) across all sessions
- **Supabase Storage** — deferred to v2, document uploads out of scope for v1

### 3.3 Auto Penalty Engine via pg_cron + DB Trigger
The penalty engine is split across two layers for reliability. Both layers are **built into Supabase** — no third-party scheduler needed for the core logic.

**Layer 1 — DB Trigger (real-time):**
- Fires automatically whenever a payment is logged
- Immediately checks if penalty applies and writes/updates the penalty row
- Handles the "payment received late" case instantly, at the moment of entry

**Layer 2 — pg_cron (daily sweep):**
- `pg_cron` is a Postgres extension built into Supabase — enabled with one SQL command
- Scheduled to run `run_penalty_sweep()` every day at midnight IST (18:30 UTC)
- Catches accounts where no payment was logged at all but the due date + grace period has passed
- Runs entirely inside the database — no HTTP call, no Next.js involvement, no cold start

```sql
-- Enable pg_cron (once, in Supabase SQL Editor)
create extension if not exists pg_cron;

-- Schedule daily penalty sweep at midnight IST
select cron.schedule(
  'daily-penalty-sweep',
  '30 18 * * *',
  $$ select run_penalty_sweep(); $$
);
```

**cron-job.org (anti-pause only — free tier):**
- `pg_cron` runs inside the database, but cannot prevent Supabase from pausing the project on the free tier
- cron-job.org is used **only** to send a daily HTTP ping to `/api/health` to keep the Supabase project active
- This is a free-tier-only concern — on Supabase Pro, cron-job.org is not needed at all

### 3.4 Role-Based Access
Three roles enforced at two levels — middleware (route protection) and Supabase RLS (data protection):

| Role | Access Level |
|---|---|
| **Admin** | Full read/write, penalty edits, foreclosure, seizure approval, UTR visibility, sub-ID management |
| **Employee** | Add customers, log payments, view pending/recovery lists, masked UTR only |
| **Sub-ID** | Create customer records within assigned range only, auto-disabled on completion |

### 3.5 OTP Confirmation for Sensitive Actions
- Supabase Auth email OTP used for: penalty edits, foreclosure processing, seizure approval
- OTP flow: Admin clicks action → OTP sent to registered email → Admin enters OTP → action proceeds
- All OTP-gated actions are logged in an audit table (user, action, timestamp, before/after values)
- SMS OTP deferred — can add Twilio / MSG91 in v2 if email OTP is insufficient

### 3.6 Data Safety
- **Soft delete only** — no hard deletes in v1. A `deleted_at` timestamp column marks records as deleted.
- **30-day recovery window** — admin can restore any soft-deleted record within 30 days
- **Audit log table** — every create/update/delete writes a row with: `user_id`, `action`, `table`, `record_id`, `old_value`, `new_value`, `timestamp`
- **Supabase automated daily backups** — included on free tier

---

## 4. Vercel Deployment Notes

- **Runtime: Standard Node.js only** — do not use `export const runtime = 'edge'` anywhere. All route handlers run as plain Node.js.
- **Function timeout:** 10 seconds on Hobby plan — kept safe because API routes are thin (auth check + one RPC call). Heavy logic runs inside the DB, not the route.
- **Bulk data entry:** Must be batched from frontend (max ~50 records per API call) — never send all 5,000 in one request
- **Environment variables:** All Supabase keys, CRON_SECRET, and any third-party keys stored in Vercel Environment Variables — never hardcoded
- **Custom domain:** Add in Vercel Dashboard → Project → Domains. Point DNS from registrar to Vercel nameservers.
- **Branches:** Use Vercel preview deployments for staging — every Git branch gets its own preview URL automatically

---

## 5. Supabase Free Tier Limits (Safe Zone)

| Resource | Free Limit | Expected Usage | Status |
|---|---|---|---|
| Database size | 500 MB | ~50–80 MB for 5,000 customers + history | ✅ Safe |
| Monthly active users | 50,000 | ~20 staff users | ✅ Safe |
| Realtime connections | 200 concurrent | ~20 max | ✅ Safe |
| Storage | 1 GB | Not used in v1 | ✅ Safe |
| Project pausing | After 7 days inactivity | Solved by cron-job.org daily ping | ✅ Solved |

---

## 6. Folder Structure (Recommended)

```
/app
  /api
    /health          → GET  — cron-job.org ping (keeps Supabase alive)
    /penalty         → GET  — daily auto penalty engine (cron-job.org trigger)
    /customers       → GET, POST
    /customers/[id]  → GET, PATCH
    /payments        → POST
    /foreclosure     → GET, POST
    /seizure         → GET, POST
    /daily-summary   → GET
    /auth/otp        → POST — trigger OTP for admin actions
  /(auth)
    /login           → Login page
  /(dashboard)
    /                → Dashboard home
    /customers       → Customer list + search
    /pending         → Pending customer list
    /recovery        → Bank recovery lists
    /summary         → Daily summary
    /foreclosure     → Foreclosure management
    /seizure         → Seizure management
    /admin           → Sub-ID management, employee management
/components          → Shared UI components
/lib
  /supabase          → Supabase client (server + browser)
  /utils             → Penalty calculation logic, formatters
/middleware.ts        → Route protection + role checks
```

---

## 7. What is Out of Scope for v1

As per PRD — do not build these in v1:
- SMS OTP (email OTP only)
- Document file uploads / storage
- GST / tax integration
- Tally / accounting integration
- Customer-facing portal
- Automated bank API integration
- Export to PDF/Excel (confirm with client — may add)
- Native Android/iOS app (PWA via responsive design only)

---

## 8. Upgrade Path (When Needed)

| Trigger | Action |
|---|---|
| Supabase project pausing despite ping | Upgrade to Supabase Pro ($25/mo) |
| Need SMS OTP | Add MSG91 (India) or Twilio |
| File/document uploads needed | Enable Supabase Storage (already in stack) |
| Function timeout issues on bulk ops | Upgrade to Vercel Pro ($20/mo) for 60s timeout |
| Need offline mobile support | Build React Native / Expo app using same Supabase backend |

---

## 9. Pro Plan Options (Anytime Upgrade)

Both platforms are designed for zero-friction upgrades. No code changes, no migrations, no redeployment — just a dashboard plan change.

### 9.1 Supabase Free → Pro ($25/month)

Upgrade when: client wants guaranteed uptime, needs document storage, or the free-tier ping workaround feels fragile.

| Feature | Free | Pro |
|---|---|---|
| Database size | 500 MB | 8 GB (extendable) |
| Project pausing | Yes — after 7 days inactivity | **No pausing, ever** |
| Daily backups | 1 day retention | 7-day point-in-time recovery |
| File storage | 1 GB | 100 GB |
| Realtime connections | 200 concurrent | 500 concurrent |
| Support | Community | Email support |
| Monthly cost | $0 | **$25/month** |

**How to upgrade:** Supabase Dashboard → Organization → Billing → Upgrade to Pro. Takes 2 minutes. No data loss, no downtime.

> Once on Pro, the cron-job.org anti-pause ping is no longer needed (can keep it or remove it — no harm either way).

---

### 9.2 Vercel Hobby → Pro ($20/month)

Upgrade when: client needs faster API responses for bulk operations, needs longer function timeouts, or wants team collaboration on the Vercel dashboard.

| Feature | Hobby (Free) | Pro |
|---|---|---|
| Serverless function timeout | **10 seconds** | **60 seconds** |
| Bandwidth | 100 GB/month | 1 TB/month |
| Cron Jobs | ❌ Not available | ✅ Built-in (replaces cron-job.org) |
| Team members | 1 (solo) | Unlimited |
| Preview deployments | ✅ | ✅ |
| Analytics | Basic | Advanced |
| Support | Community | Priority email |
| Monthly cost | $0 | **$20/month** |

**How to upgrade:** Vercel Dashboard → Settings → Billing → Upgrade to Pro. Instant, no redeployment needed.

> On Vercel Pro, you can replace cron-job.org with Vercel's native Cron Jobs (configured in `vercel.json`) for a cleaner, fully integrated setup.

---

### 9.3 Both Upgraded — Full Pro Stack

| Service | Cost |
|---|---|
| Vercel Pro | $20/month |
| Supabase Pro | $25/month |
| Domain | ~₹800/year |
| **Total** | **~$45/month (~₹3,800/month)** |

This is still extremely cost-effective for a business managing thousands of loan accounts. At this tier, the system has enterprise-grade uptime, 60-second API timeouts, 100GB storage, full backup recovery, and built-in cron — no workarounds needed.

---

### 9.4 Upgrade Decision Guide

```
Is Supabase pausing despite the daily ping?
  └─ Yes → Upgrade Supabase to Pro ($25/mo)

Are bulk data entry API calls timing out?
  └─ Yes → Upgrade Vercel to Pro ($20/mo)

Does the client want a cleaner, fully paid setup
with no free-tier workarounds?
  └─ Yes → Upgrade both → $45/mo total

Is the system running fine on free tier?
  └─ Yes → Stay on free, save the cost
```

---

*Last updated: May 2026 | Stack locked for v1 development*
