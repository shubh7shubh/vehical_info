# Vehicle Finance — Client Testing Guide

Welcome! This guide walks you through everything you can test in the system
**right now**. You don't need any technical background — just an internet
browser.

---

## What you have today

The system is now organised around **branches**. Here's the simple picture:

- **You are the Owner.** You sit at the top. You can create branches, give each
  branch its own manager, and see how every branch is doing — all from one
  screen.
- **Each branch has its own Admin.** A branch Admin runs only their own branch:
  they add their own staff and manage their own records.
- **Each branch is private.** One branch cannot see another branch's people or
  records. This keeps every branch's information separate and secure.

Customer onboarding, payments, penalty tracking and reports are coming in the
next few days. For now you can fully test branches, owners, admins and staff.

---

## A quick note on roles

| Role | Who it is | What they can do |
|---|---|---|
| **Owner** | You | Create and manage branches; see every branch's totals; look inside any branch |
| **Admin** | A branch manager | Run one branch — add that branch's staff, manage roles |
| **Employee** | Branch staff | Day-to-day work inside one branch |
| **Sub-ID** | A temporary data-entry account | Bulk-enter old record books, limited to a fixed range of records |

---

## Before you start

You should have received from us:

- **Website:** https://vehical-info.vercel.app/
- Your **Owner email** and **password**

Open the link in **Google Chrome** or **Microsoft Edge** for the smoothest
experience. Mobile works too.

> If you used this system before, your old login still works — it is now your
> **Owner** account.

---

## Test 1 — Sign in as the Owner

1. Open https://vehical-info.vercel.app/
2. You'll automatically land on a sign-in page
3. Enter your Owner email and password
4. Click **Sign in**

✅ **What you should see:**
- A page titled **Owner Overview** with an `owner` badge at the top right
- A row of summary boxes: **Branches, Customers, Active loans, Staff**
- A simple navigation bar with just **Dashboard** and **Branches**
- If you have no branches yet, a button inviting you to create your first one

---

## Test 2 — Create your first branch

A branch is created together with the person who will manage it (its Admin).

1. Click **Branches** in the top navigation
2. In the **Create branch** form, fill in:
   - Branch name: `Pune Branch`
   - Code (optional): `PUN`
   - City (optional): `Pune`
   - Branch admin email: `pune.admin@test.com`
   - Admin password: `Welcome123!`
3. Click **Create branch**

✅ **What you should see:**
- A green confirmation banner
- A card for **Pune Branch**, showing `pune.admin@test.com` listed as its Admin

> The branch Admin can sign in straight away with the email and password you
> just set — you don't need to involve us.

---

## Test 3 — Create a second branch

Repeat Test 2 to make another branch, so you can later confirm branches stay
separate:

- Branch name: `Mumbai Branch`
- Code: `MUM`
- City: `Mumbai`
- Branch admin email: `mumbai.admin@test.com`
- Admin password: `Welcome123!`

✅ A second branch card appears for **Mumbai Branch**.

---

## Test 4 — See all your branches at a glance

1. Click **Dashboard** in the top navigation

✅ **What you should see:**
- The summary boxes at the top now count **2 branches**
- A card for each branch showing its **Customers, Loans and Staff** counts
  (these will be zero for now — they fill in as branches start working)

---

## Test 5 — Sign in as a branch Admin

This shows that a branch Admin sees only their own branch.

1. Open a **new incognito / private browser window**
   (Chrome: Ctrl+Shift+N · Edge: Ctrl+Shift+N · Safari: Cmd+Shift+N)
2. Visit https://vehical-info.vercel.app/
3. Sign in with `pune.admin@test.com` / `Welcome123!`

✅ **What you should see:**
- A dashboard showing the **Pune Branch** name near the top
- An `admin` badge (not `owner`)
- A navigation bar with **Dashboard, Customers, Pending, Bank Recovery,
  Daily Summary, Admin**

### Confirm the Owner area is protected

1. While signed in as the Pune Admin, type this address by hand:
   `https://vehical-info.vercel.app/dashboard/owner`
2. ✅ You are sent back to the normal dashboard — only the Owner can open the
   Owner area.

---

## Test 6 — A branch Admin adds their own staff

1. Still signed in as the Pune Admin, click **Admin** in the navigation
2. Click the **Users** tile
3. ✅ You see only **Pune Branch** staff — just the Pune Admin for now
4. In the **Add user** form, fill in:
   - Email: `pune.employee@test.com`
   - Password: `Welcome123!`
   - Role: `Employee`
   - Leave the range fields empty
5. Click **Add user**

✅ A green banner appears and the new employee shows up in the list.

You can also add a **Sub-ID** account here (a temporary data-entry login). Use
role `Sub-ID` and give it a record range, for example start `1` and end `500`.

---

## Test 7 — Branches stay separate

1. Open another incognito window and sign in as the **Mumbai** Admin
   (`mumbai.admin@test.com` / `Welcome123!`)
2. Go to **Admin → Users**

✅ **What you should see:**
- Only **Mumbai Branch** staff
- The Pune people (`pune.admin@test.com`, `pune.employee@test.com`) are
  **nowhere to be seen** — branches cannot view each other's information.

---

## Test 8 — The Owner can look inside any branch

1. Back in your **Owner** window, go to **Dashboard**
2. Click the **Pune Branch** card

✅ **What you should see:**
- A detailed view of Pune Branch: its totals, its staff list, and a record of
  recent activity
- This is a **view-only** screen — the Owner watches over branches but the
  day-to-day work is done by each branch's own Admin and staff.

---

## Test 9 — Add a second Admin to a branch

A branch can safely have more than one Admin (useful when one is on leave).

1. As the Owner, go to **Branches**
2. On the **Pune Branch** card, use the **Add admin** box:
   - Email: `pune.admin2@test.com`
   - Password: `Welcome123!`
3. Click **Add admin**

✅ The new admin appears under Pune Branch's Admins list.

### Safety guardrail

The system protects each branch from being left with **no Admin**. While a
branch has only one Admin, that Admin cannot remove or disable themselves. Once
a second Admin exists, those actions are allowed again.

---

## Test 10 — Archive a branch

If a branch closes, you can archive it (this hides it without losing anything).

1. As the Owner, go to **Branches**
2. On a test branch card, click **Archive**

✅ The card shows an **Archived** label. Clicking **Restore** brings it back.

---

## Test 11 — Sign out

1. Click **Sign out** in the top-right corner

✅ You are returned to the login page.

---

## What to report back

Please let us know:

| Item | Status |
|---|---|
| Did you receive working Owner credentials? | Yes / No |
| Were you able to create branches with their admins? | Yes / No |
| Did each branch Admin see only their own branch? | Yes / No |
| Did all 11 tests pass? | Yes / No |
| Anything that didn't work as described? | (notes) |
| Anything confusing or unclear in the screens? | (notes) |
| On a phone, did the screens fit and work? | Yes / No |

---

## What's coming next

The next few days bring, **inside each branch**:

- **Customer onboarding** — full add-customer form with guarantor and vehicle
  details
- **Smart search** — find any customer by name, RC number, engine number,
  mobile, or Aadhaar
- **Customer card** — single screen showing customer + guarantor + vehicle +
  loan history
- **EMI tracking + auto penalty** — log payments; the system applies penalty
  automatically after the grace period
- **Pending customer list** — filter by 0 / 1 / 3 / 5 / Below 3 / Above 5
  overdue installments
- **Bank Recovery lists** — one per partner bank, colour-coded
- **Daily Summary** — end-of-day cash + online collections, totals, pending
- **Foreclosure & Seizure** — early loan closure calculator and vehicle
  repossession logging
- **Documents & Keys** — track physical handover statuses

You'll get an updated test guide for each new piece as it ships.

---

*If anything goes wrong during testing — a page won't load, a button does
nothing, an error message appears — please screenshot it and send it over. Even
small issues are useful to hear about.*
