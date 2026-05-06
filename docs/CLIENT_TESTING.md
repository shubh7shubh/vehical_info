# Vehicle Finance — Client Testing Guide

Welcome! This document walks you through everything you can test in the system **right now**. You don't need any technical background — just an internet browser.

---

## What you have today

A secure, role-based login system with a working **Admin Panel** to manage your staff. Customer onboarding, payments, penalty tracking, and reports are coming in the next few days.

---

## Before you start

You should have received from us:

- **Website:** https://vehical-info.vercel.app/
- An **admin email** and **password**

Open the link in **Google Chrome** or **Microsoft Edge** for the smoothest experience. Mobile works too.

---

## Test 1 — Sign in as admin

1. Open https://vehical-info.vercel.app/
2. You'll automatically land on a sign-in page
3. Enter the admin email and password we sent you
4. Click **Sign in**

✅ **What you should see:**
- A dashboard with your email shown at the top right and an `admin` badge
- A navigation bar containing: **Dashboard, Customers, Pending, Bank Recovery, Daily Summary, Admin**
- Quick-access tiles for Pending Customers, Bank Recovery, Daily Summary, Total Customers

> The tiles for Customers, Pending, Bank Recovery, etc. will start working in the upcoming days. For now, focus on the **Admin** section.

---

## Test 2 — Open the Admin Panel

1. From the dashboard, click **Admin** in the top navigation
2. Click the **Users** tile

✅ **What you should see:**
- An "Add user" form at the top
- A table listing all users in the system (just yourself for now), marked **(you)**, with role **admin** and status **Active**

---

## Test 3 — Create a new employee

This proves you can add staff yourself, without involving us.

1. In the **Add user** form fill:
   - Email: `employee1@test.com`
   - Password: `Welcome123!`
   - Role: `Employee`
   - Leave the range fields empty
2. Click **Add user**

✅ **What you should see:**
- A green confirmation banner at the top: *"Created employee1@test.com"*
- A new row in the table for that user, with role **employee** and status **Active**

---

## Test 4 — Sign in as that employee

1. Open a **new incognito / private browser window** (Chrome: Ctrl+Shift+N · Edge: Ctrl+Shift+N · Safari: Cmd+Shift+N)
2. Visit https://vehical-info.vercel.app/
3. Sign in with `employee1@test.com` / `Welcome123!`

✅ **What you should see:**
- The dashboard, but with **no Admin link** in the navigation
- Role badge says **employee**, not admin

### Confirm role gating works

1. While logged in as the employee, try typing this URL by hand:
   `https://vehical-info.vercel.app/dashboard/admin`
2. ✅ You should be redirected back to the dashboard automatically — employees cannot view admin pages.

3. Sign out from this incognito window.

---

## Test 5 — Create a Sub-ID (data-entry account)

Sub-IDs are temporary accounts you'll use later to bulk-enter your physical record books. Each Sub-ID is restricted to a specific range of records (e.g., "records 1 to 500").

1. Back in your admin browser, on the **Users** page, click **Add user** again with:
   - Email: `entry1@test.com`
   - Password: `Welcome123!`
   - Role: `Sub-ID`
   - Range start: `1`
   - Range end: `500`
2. Click **Add user**

✅ **What you should see:**
- New row appears with role `sub_id`, range `1 – 500`, status **Active**

### Sign in as the Sub-ID

1. Open another incognito window
2. Sign in with `entry1@test.com` / `Welcome123!`

✅ **What you should see:**
- A simplified screen titled **Bulk Data Entry**
- A clear note: *"You can add customer records within your assigned range only."*
- Range shown: **1 – 500**
- No navigation menu, no admin tiles — only the entry-focused view

3. Sign out.

---

## Test 6 — Change someone's role

1. As admin, on the Users page, find the row for `employee1@test.com`
2. Change the role dropdown from **Employee** to **Sub-ID**
3. Set range start `501`, end `1000`
4. Click **Save**

✅ **What you should see:**
- Green banner: *"Role updated"*
- The row now shows role `sub_id` and range `501 – 1000`

5. Sign in as `employee1@test.com` in incognito → ✅ they now see the **Bulk Data Entry** screen (their role changed live).

---

## Test 7 — Disable a user

1. As admin, on the row for `employee1@test.com`, click **Disable**

✅ **What you should see:**
- Green banner: *"Account disabled"*
- Status badge flips from **Active** to **Disabled**

2. Try to sign in as `employee1@test.com` in incognito

✅ **What you should see:**
- Sign-in is rejected — you're sent back to the login page. Disabled accounts cannot log in.

3. Back as admin, click **Enable** on the same row → status returns to **Active** and they can sign in again.

---

## Test 8 — Safety guardrails

The system protects you from locking yourself out. Try each of these and confirm the system blocks them:

1. On your own row, try to change role from **Admin** to **Employee** → ✅ Red banner: *"You cannot demote yourself"*
2. ✅ The **Disable** button on your own row is greyed out and unclickable
3. ✅ The **Delete** button on your own row is greyed out and unclickable

> If you create a **second admin** first and then try to demote/disable the original admin, those will work — the system only blocks operations that would leave you with **zero** admins.

---

## Test 9 — Delete a user

1. As admin, on the row for `entry1@test.com`, click **Delete**

✅ **What you should see:**
- Green banner: *"User deleted"*
- The row disappears completely
- That user can no longer sign in

---

## Test 10 — Sign out

1. Click **Sign out** in the top-right of the dashboard

✅ **What you should see:**
- You're returned to the login page

---

## What to report back

Please let us know:

| Item | Status |
|---|---|
| Did you receive working admin credentials? | Yes / No |
| Did all 10 tests pass? | Yes / No |
| Anything that didn't work as described? | (notes) |
| Anything confusing or unclear in the screens? | (notes) |
| On a phone, did the screens fit and work? | Yes / No |

---

## What's coming next

The next few days bring:

- **Customer onboarding** — full add-customer form with guarantor and vehicle details
- **Smart search** — find any customer by name, RC number, engine number, mobile, or Aadhaar
- **Customer card** — single screen showing customer + guarantor + vehicle + loan history
- **EMI tracking + auto penalty** — log payments, system applies penalty automatically after the grace period
- **Pending customer list** — filter by 0 / 1 / 3 / 5 / Below 3 / Above 5 overdue installments
- **Bank Recovery lists** — one per partner bank, color-coded
- **Daily Summary** — end-of-day cash + online collections, totals, pending
- **Foreclosure & Seizure** — early loan closure calculator and vehicle repossession logging
- **Documents & Keys** — track physical handover statuses

You'll get an updated test guide for each new piece as it ships.

---

*If anything goes wrong during testing — a page won't load, a button does nothing, an error message appears — please screenshot it and send it over. Even small issues are useful to hear about.*
