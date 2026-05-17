# Vehicle Finance — Client Testing Guide

Welcome! This guide walks you through everything you can test in the system
**right now**. You don't need any technical background — just an internet
browser.

---

## What you have today

The system is organised around **branches**. Here's the simple picture:

- **You are the Owner.** You sit at the top. You can create branches, give each
  branch its own manager, and see how every branch is doing — all from one
  screen.
- **Each branch has its own Admin.** A branch Admin runs only their own branch:
  they add their own staff and their own customers.
- **Each branch is private.** One branch cannot see another branch's people,
  customers or records. This keeps every branch's information separate and
  secure.

New in this round: inside a branch you can now **add customers**, **search for
any customer**, and open a **full customer card**. Payments, penalty tracking
and reports are coming next.

---

## A quick note on roles

| Role | Who it is | What they can do |
|---|---|---|
| **Owner** | You | Create and manage branches; see every branch's totals; look inside any branch |
| **Admin** | A branch manager | Run one branch — add that branch's staff and customers |
| **Employee** | Branch staff | Add and view customers inside one branch |
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

> While pages load you'll see a thin moving bar at the very top and a light
> grey placeholder — that's the system telling you it's working. This is normal.

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

✅ A green confirmation banner appears and a card for **Pune Branch** shows,
with `pune.admin@test.com` listed as its Admin.

---

## Test 3 — Create a second branch

Repeat Test 2 to make another branch:

- Branch name: `Mumbai Branch`
- Code: `MUM`
- City: `Mumbai`
- Branch admin email: `mumbai.admin@test.com`
- Admin password: `Welcome123!`

✅ A second branch card appears for **Mumbai Branch**.

---

## Test 4 — See all your branches at a glance

1. Click **Dashboard** in the top navigation

✅ The summary boxes count **2 branches**, and each branch shows its
**Customers, Loans and Staff** counts.

---

## Test 5 — Sign in as a branch Admin

1. Open a **new incognito / private browser window**
   (Chrome / Edge: Ctrl+Shift+N · Safari: Cmd+Shift+N)
2. Visit https://vehical-info.vercel.app/
3. Sign in with `pune.admin@test.com` / `Welcome123!`

✅ **What you should see:**
- A dashboard showing the **Pune Branch** name near the top
- An `admin` badge (not `owner`)
- A navigation bar with **Dashboard, Customers, Pending, Bank Recovery,
  Daily Summary, Admin**

### Confirm the Owner area is protected

1. Type this address by hand: `https://vehical-info.vercel.app/dashboard/owner`
2. ✅ You are sent back to the normal dashboard — only the Owner can open the
   Owner area.

---

## Test 6 — A branch Admin adds their own staff

1. Still signed in as the Pune Admin, click **Admin** → click the **Users** tile
2. ✅ You see only **Pune Branch** staff — just the Pune Admin for now
3. In the **Add user** form add an employee:
   - Email: `pune.employee@test.com`
   - Password: `Welcome123!`
   - Role: `Employee`
4. Click **Add user**

✅ A green banner appears and the new employee shows in the list.

---

## Test 7 — Add a customer

A branch Admin (or Employee) adds customers to their own branch.

1. Signed in as the Pune Admin, click **Customers** in the top navigation
2. Click **Add customer**
3. Fill in the form. Boxes marked **\*** are required:
   - **Customer details** — first name, village, mobile number
   - **Vehicle details** — vehicle name, RC number, engine number, chassis
   - **Guarantor details** — optional; fill the name to add one
   - **Loan details** — bank, loan amount, EMI amount, tenure, EMI due day,
     loan start date
4. Click **Save customer**

✅ **What you should see:**
- You're taken straight to the new customer's page showing everything entered.

### Two things to try

- **Incomplete record:** add a customer but leave the engine numbers blank.
  ✅ The customer still saves, but shows an orange **Record incomplete** tag —
  a reminder to fill the engine details later.
- **Duplicate vehicle:** add another customer using the **same RC number** as an
  existing one. ✅ The system blocks it with a clear message, and nothing is
  half-saved.

---

## Test 8 — Find a customer with search

1. Go to **Customers** (or use the search box on the dashboard)
2. Type any one of these and click **Search**:
   - part of the customer's name
   - the vehicle RC number
   - an engine number
   - a mobile number
   - the Aadhaar number

✅ Matching customers appear. If two customers have similar names, both are
shown with their village and mobile number so you can tell them apart.

---

## Test 9 — Open a customer's full card

1. Click any customer from the list or the search results

✅ **What you should see:**
- The customer's full card with tabs across the top: **Customer, Vehicle,
  Guarantor, Loan, EMI History, Foreclosure / Seizure, Documents & Keys**
- The **Customer, Vehicle, Guarantor and Loan** tabs show the details you
  entered. The remaining tabs will fill in as those features ship.
- On a phone, the tab strip slides sideways so every tab is reachable.

---

## Test 10 — Branches stay separate

1. Open another incognito window and sign in as the **Mumbai** Admin
   (`mumbai.admin@test.com` / `Welcome123!`)
2. Go to **Admin → Users** → ✅ only Mumbai staff are listed; the Pune people
   are nowhere to be seen.
3. Go to **Customers** and search for the customer you added in Pune →
   ✅ no result. One branch cannot see another branch's customers.

---

## Test 11 — The Owner can look inside any branch

1. Back in your **Owner** window, go to **Dashboard**
2. Click the **Pune Branch** card

✅ A detailed view of Pune Branch opens — its totals, staff list, and recent
activity. This is a **view-only** screen: the Owner watches over branches, while
the day-to-day work is done by each branch's own Admin and staff.

---

## Test 12 — Add a second Admin to a branch

A branch can safely have more than one Admin (useful when one is on leave).

1. As the Owner, go to **Branches**
2. On the **Pune Branch** card, use the **Add admin** box:
   - Email: `pune.admin2@test.com`
   - Password: `Welcome123!`
3. Click **Add admin**

✅ The new admin appears under Pune Branch's Admins list.

> **Safety guardrail:** while a branch has only one Admin, that Admin cannot
> remove or disable themselves. Once a second Admin exists, it is allowed again.

---

## Test 13 — Archive a branch

If a branch closes, you can archive it (this hides it without losing anything).

1. As the Owner, go to **Branches**
2. On a test branch card, click **Archive**

✅ The card shows an **Archived** label. Clicking **Restore** brings it back.

---

## Test 14 — Sign out

1. Click **Sign out** in the top-right corner

✅ You are returned to the login page.

---

## What to report back

Please let us know:

| Item | Status |
|---|---|
| Did you receive working Owner credentials? | Yes / No |
| Were you able to create branches with their admins? | Yes / No |
| Were you able to add and search customers in a branch? | Yes / No |
| Did each branch see only its own staff and customers? | Yes / No |
| Did all 14 tests pass? | Yes / No |
| Anything that didn't work as described? | (notes) |
| Anything confusing or unclear in the screens? | (notes) |
| On a phone, did the screens fit and work? | Yes / No |

---

## What's coming next

The next few days bring, **inside each branch**:

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
