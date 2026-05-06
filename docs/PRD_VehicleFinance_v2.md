# Product Requirements Document
## Vehicle Finance Loan Management System
### Internal Operations Platform

---

| Field | Details |
|---|---|
| **Version** | 1.0 — Draft |
| **Date** | May 2026 |
| **Status** | For Review & Approval |
| **Platform** | Web App |
| **Users** | Admin, Employees (Data Entry) |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Stakeholders & User Roles](#2-stakeholders--user-roles)
3. [Feature Modules & Requirements](#3-feature-modules--requirements)
   - 3.1 [Dashboard](#31-dashboard)
   - 3.2 [Customer Management & Smart Search](#32-customer-management--smart-search)
   - 3.3 [Pending Customer List](#33-pending-customer-list)
   - 3.4 [Bank Recovery List](#34-bank-recovery-list)
   - 3.5 [Auto Penalty Engine](#35-auto-penalty-engine)
   - 3.6 [Vehicle Seizure (Manual Entry)](#36-vehicle-seizure-manual-entry)
   - 3.7 [Foreclosure (Early Loan Closure)](#37-foreclosure-early-loan-closure)
   - 3.8 [Documents & Key Handling](#38-documents--key-handling)
   - 3.9 [Daily Summary](#39-daily-summary)
   - 3.10 [Total Customers](#310-total-customers)
4. [Bulk Historical Data Entry Plan](#4-bulk-historical-data-entry-plan)
5. [Access Control & Security](#5-access-control--security)
6. [System & Technical Requirements](#6-system--technical-requirements)
7. [Out of Scope (v1)](#7-out-of-scope-v1)
8. [Open Questions & Decisions Needed](#8-open-questions--decisions-needed)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Glossary](#10-glossary)

---

## 1. Executive Summary

This document outlines the product requirements for a **Vehicle Finance Loan Management System** — a fully cloud-hosted, real-time web and mobile application designed to replace physical record books used by a vehicle finance business managing approximately **4,500–5,000 active customers**.

The system will digitize end-to-end loan lifecycle management: from onboarding new customers and tracking EMI payments to auto-calculating penalties, managing bank recovery lists, handling foreclosures, and generating daily financial summaries. Data entry will be distributed across sub-accounts to handle the large volume of historical records currently in physical ledgers.

### Key Goals

- Replace physical books with a **secure, searchable digital system**
- **Auto-enforce penalty rules** without manual intervention
- Provide **role-based access** (Admin vs. Employee) with OTP-based approvals
- Support **dual-bank recovery tracking** with separate color-coded lists
- Enable **bulk historical data entry** via temporary sub-IDs
- Ensure **data recoverability** — no corruption or permanent loss

---

## 2. Stakeholders & User Roles

| Role | Type | Permissions |
|---|---|---|
| **Admin** | Owner / Manager | Full access: view, edit, approve penalties, manage employees, access all reports, see full UTR numbers |
| **Employee** | Field / Office Staff | Add/view customers, log payments, view pending lists, view masked UTR; cannot edit penalties or foreclosure amounts |
| **Data Entry Sub-ID** | Temporary | Limited to entering customer records in an assigned range; auto-disabled after task completion |

---

## 3. Feature Modules & Requirements

### 3.1 Dashboard

The dashboard is the **primary landing screen** after login. It provides an at-a-glance summary and quick navigation to all major functions.

#### Dashboard Sections

- **Top header strip:** Date, current month, total installments collected, penalty amount, receipt count, pending signatures
- **Global smart search bar** (see Section 3.2)
- **Quick-access tiles** for: Pending Customers, Bank Recovery, Daily Summary, Total Customers
- **Notification area** for auto-flagged overdue accounts

#### After Search — Customer Card

Clicking a search result opens a full customer card showing:

- Customer Details
- Guarantor Details
- Vehicle Details
- Loan summary: total installments, paid count, pending count, next due date
- EMI history table with payment dates and penalty amounts
- Foreclosure / Seizure status (if applicable)
- Documents & Key handover status

---

### 3.2 Customer Management & Smart Search

#### Customer Record Fields

| Personal Info | Loan Info | Vehicle Info |
|---|---|---|
| Full name (first, middle, last) | Loan amount | Vehicle name/model |
| Address (taluka, village) | EMI amount | Vehicle number (RC) |
| Mobile number(s) | Tenure (months) | Engine number (2 fields) |
| Aadhaar / ID reference | EMI due date | Chassis number |
| | Bank assigned | |

#### Smart Search Rules

- Search accepts: **customer name (partial), RC number, engine number, mobile number, or Aadhaar**
- If multiple customers share a name, system displays a **disambiguation list** (middle name, address, mobile)
- Fetching a customer with incomplete engine number triggers a system warning: `Record incomplete — engine details missing`
- Any single unique identifier must return the **full customer profile**

---

### 3.3 Pending Customer List

Displays all customers with overdue or partially-paid installments. Filterable by pending installment count.

| Filter | Description |
|---|---|
| **0 Pending** | Regular / fully paid-up customers (current month) |
| **1 Pending** | Customers with exactly 1 installment overdue |
| **3 Pending** | Customers with exactly 3 installments overdue |
| **5 Pending** | Customers with exactly 5 installments overdue |
| **Below 3** | Range filter: 1 or 2 pending installments |
| **Above 5** | Range filter: more than 5 pending installments (high risk) |

**Each row shows:** customer name, loan amount, EMIs paid, EMIs pending, last payment date, penalty accrued

- Clickable rows open the full customer card (no additional search required)
- Export option available to Admin

---

### 3.4 Bank Recovery List

The business receives funding from 2 banks and repays them monthly using EMI collections from customers. The Bank Recovery List tracks which customers belong to each bank's portfolio.

- Two separate lists — **one per bank** — displayed in different colors/themes
- List automatically **grows** when new customers are onboarded
- List automatically **shrinks** when a customer account closes (loan fully paid or foreclosed)
- Each list shows: customer name, loan amount, monthly EMI, next due date, payment status
- Admin can mark bulk monthly repayment to the bank as done

---

### 3.5 Auto Penalty Engine

Penalty is applied **automatically** based on each customer's fixed EMI due date. No manual trigger or message is required.

#### Rules

- **Grace period:** 2–3 days after the due date (configurable per customer or globally by Admin)
- If payment is not received within the grace period, **penalty is applied automatically**
- Penalty type is set per customer:
  - **Per-day** (e.g., ₹50/day)
  - **Monthly fixed** (e.g., ₹500/month)
- Penalty amount reflects immediately in the system — visible on the customer card and daily summary

#### Example

> Due date: 7th of month. Grace: 2 days. Payment received on 10th → Penalty of 3 days (or 1 monthly slab) auto-applied.

#### Controls

- **Employees** can VIEW penalty amount but **cannot edit or waive it**
- Only **Admin** can modify, waive, or override a penalty — requires OTP or password confirmation
- All penalty edits are **logged** with timestamp and admin ID

---

### 3.6 Vehicle Seizure (Manual Entry)

When a vehicle is physically repossessed, the seizure event and associated charges are logged manually by the employee and approved by Admin.

- Seizure amount is **variable per case** (e.g., ₹800 or ₹1,200 depending on effort/expenses)
- Employee can create a seizure entry and add notes
- **Admin must approve** the final seizure charge amount (OTP/password required)
- Seizure status visible on customer card as: `Pending Approval` / `Active` / `Resolved`
- Employees can **view but not edit** approved seizure records

---

### 3.7 Foreclosure (Early Loan Closure)

When a customer wishes to close the loan before tenure end, the system calculates the reduced payable amount.

#### Calculation Logic

| Component | Example Value |
|---|---|
| Remaining interest (original) | ₹6,000 |
| Bank foreclosure charge | ₹1,000 |
| **Net amount payable by customer** | **₹5,000** (₹6,000 − ₹1,000) |

#### Foreclosure Screen Shows

- Remaining loan months
- Total interest originally scheduled
- Interest waived (reduction)
- Bank foreclosure charge
- Final payable amount
- Payment status: `Paid` / `Pending`
- NOC issuance status
- Key handover status

---

### 3.8 Documents & Key Handling

Tracks physical handover of vehicle keys and ownership documents, which may occur at different times from loan closure.

- **Key Handover:** Status (Done / Pending), handover date, received-by name
- **Document Handover:** Status (Done / Pending), document type, handover date
- **Separate sub-section:** `Bank Documents & Key` — for emergency cases where bank-held originals need tracking
- Admin can update statuses; employees can view

---

### 3.9 Daily Summary

A consolidated end-of-day financial view for the admin and authorized employees.

#### Sections

- **Cash Collections:** List of customers who paid cash, individual amounts, running total
- **Online Collections:** List of customers who paid online
  - UTR number: **masked for employees** (e.g., `XXXX-XXXX-1234`), **full visible to Admin**
  - Bank account selection: which company account the payment was credited to
  - Vendor/dealer account tracking if applicable
- Total collected (cash + online)
- Pending collections for the day
- Penalty amounts auto-added

---

### 3.10 Total Customers

A management overview of the entire customer base.

- Active customers count (currently ~4,500–5,000)
- New customers added this month
- Closed/foreclosed accounts this month
- **Sub-section: Add New Customer** — opens the full onboarding form
- **Sub-section: Closing Customers** — lists accounts pending closure confirmation

---

## 4. Bulk Historical Data Entry Plan

Approximately **4,500–5,000 records** currently exist only in physical books. A phased data entry strategy is required to migrate this into the system without errors.

### Sub-ID Approach

- Admin creates multiple **temporary sub-ID accounts** (e.g., Entry-A, Entry-B)
- Each sub-ID is assigned a **specific record range** (e.g., Entry-A: records 1–500, Entry-B: 501–1000)
- Sub-IDs can only **create** new customer records — no editing, no deletion
- Admin **monitors completion progress** per sub-ID
- Once a range is fully entered and verified, the sub-ID is **deactivated automatically** or by Admin
- Admin performs a **spot-check audit** before marking a batch complete

### Data Validation During Entry

- System flags **incomplete records** (e.g., missing engine number) with a warning badge
- **Duplicate detection:** if RC number or engine number already exists, system alerts the operator before saving
- All entries show **entered-by sub-ID and timestamp** for traceability

---

## 5. Access Control & Security

| Feature / Action | Admin | Employee | Sub-ID | Approval Required |
|---|---|---|---|---|
| View customer details | ✅ | ✅ | ❌ | — |
| Add new customer | ✅ | ✅ | ✅ (range only) | — |
| Log payment | ✅ | ✅ | ❌ | — |
| Edit/waive penalty | ✅ | ❌ | ❌ | OTP / Password |
| Approve seizure amount | ✅ | ❌ | ❌ | OTP / Password |
| Process foreclosure | ✅ | View only | ❌ | Admin Only |
| View UTR (full) | ✅ | ❌ (masked) | ❌ | — |
| Manage sub-IDs | ✅ | ❌ | ❌ | — |
| Disable employee access | ✅ | ❌ | ❌ | — |
| View Daily Summary | Full | Partial | ❌ | — |

**Additional Notes:**

- Multiple admin accounts are supported
- Admin can **disable any employee or sub-ID account instantly**
- All sensitive actions (penalty edits, foreclosure, seizure approval) require **OTP or secondary password**

---

## 6. System & Technical Requirements

### 6.1 Platform

- **Web application** (browser-based, responsive)
- **Mobile access** via responsive design or dedicated mobile app (PWA acceptable for v1)
- **Cloud-hosted** — real-time updates across all devices and users simultaneously

### 6.2 Data Integrity & Recovery

- All data stored on cloud with **automated daily backups**
- **Soft-delete only** — no permanent deletion without admin confirmation + 30-day recovery window
- **Zero data corruption guarantee** — all writes use transactional database operations
- **Audit log** maintained for all create/update/delete operations (user, timestamp, before/after values)

### 6.3 Performance

| Metric | Target |
|---|---|
| Search results (up to 5,000 customers) | < 2 seconds |
| Dashboard load time (standard mobile connection) | < 3 seconds |
| Concurrent users without degradation | ≥ 20 users |

### 6.4 Security

- **HTTPS only** — all data encrypted in transit
- Role-based access enforced **server-side** (not just UI)
- **OTP-based confirmation** for all admin-level sensitive actions
- **Session timeout** after 30 minutes of inactivity
- No GST module required — internal system only, no external audit integration

---

## 7. Out of Scope (v1)

The following features are explicitly **not included** in the first version:

- GST / Tax filing integrations
- External auditor access or reporting
- Automated SMS / WhatsApp reminders to customers (penalty is system-internal only)
- Accounting / tally integration
- Customer-facing portal or app
- Automated bank API integration (bank repayment is tracked manually)

---

## 8. Open Questions & Decisions Needed

The following must be confirmed by the client **before development begins**. Unresolved items may affect timeline, scope, or cost.

| # | Priority | Question | Notes / Context |
|---|---|---|---|
| 1 | 🔴 HIGH | Is 'Auto Sizing' in the feature list actually meant to be 'Auto Seizing' (vehicle repossession)? | Terminology in handwritten notes says 'Auto cizing' — assumed to mean Seizure throughout this PRD. Client to confirm. |
| 2 | 🔴 HIGH | Should penalty be per-day, fixed monthly, or configurable per individual customer at onboarding? | Both types mentioned in call. PRD supports both but a default rule is needed for new customers. |
| 3 | 🔴 HIGH | Should customers be searchable by RC number alone across all banks, or only within their assigned bank? | Impacts search architecture — cross-bank lookup vs. scoped lookup. |
| 4 | 🟡 MED | Should Guarantor and Vehicle information open in tabs on the customer card, or as separate expanded sections on the same page? | UX preference — tabs are cleaner on mobile; sections are easier to print. |
| 5 | 🟡 MED | Is export to PDF and/or Excel required for customer lists, pending lists, daily summaries, or bank recovery reports? | Currently only basic admin export is planned. Scope/cost may increase if export is required across multiple modules. |
| 6 | 🟡 MED | Should deleted records use soft-delete only (recoverable within a window), or should hard-delete also be available to admin? | PRD currently specifies soft-delete with 30-day recovery. Confirm if hard-delete is ever needed. |
| 7 | 🟡 MED | What is the exact grace period — 2 days or 3 days? Is it the same for all customers or set per customer? | Mentioned as '2–3 days' in call. Affects auto-penalty trigger logic. |
| 8 | 🟡 MED | Which 2 banks are involved? Confirm bank names for list labels and color coding. | Required before building the Bank Recovery module. |
| 9 | 🟢 LOW | Should the mobile version be a Progressive Web App (PWA) or a native Android/iOS app? | PWA costs less; native app gives better performance and offline support. |
| 10 | 🟢 LOW | What is the target timeline for completing historical data entry of ~4,500–5,000 physical records? | Determines how many sub-IDs to provision and the data entry QA plan. |
| 11 | 🟢 LOW | Are there any existing digital records (Excel, CSV) that can be imported, or is all data in physical books only? | All in physical books per call — but confirming avoids rework if any partial digital records exist. |

> **Priority Key:** 🔴 HIGH = blocks development | 🟡 MED = affects UX or scope | 🟢 LOW = operational / planning input

---

## 9. Acceptance Criteria

The product will be considered **complete and ready for go-live** when all of the following criteria are met and verified during User Acceptance Testing (UAT):

| ID | Acceptance Criterion | Module | Status |
|---|---|---|---|
| **AC-01** | A user can search with partial data (first name, surname, vehicle number, RC, engine number, or mobile) and retrieve the correct, complete customer record | Customer / Search | `[ ] Pass [ ] Fail` |
| **AC-02** | Full customer details, guarantor details, and vehicle details are visible from a single screen without requiring a second search | Dashboard / Customer Card | `[ ] Pass [ ] Fail` |
| **AC-03** | If multiple customers share the same name, the system shows a disambiguation list using middle name, address, or mobile number | Smart Search | `[ ] Pass [ ] Fail` |
| **AC-04** | The Pending Customer List filters correctly for all bands: 0, 1, 3, 5 pending, Below 3, and Above 5 overdue installments | Pending List | `[ ] Pass [ ] Fail` |
| **AC-05** | Both Bank Recovery Lists display the correct customer sets per bank, grow when customers are added, and shrink when accounts are closed | Bank Recovery | `[ ] Pass [ ] Fail` |
| **AC-06** | Penalty is applied automatically after the due date + grace period, without any manual trigger. The amount reflects correctly as per-day or monthly-fixed rules | Auto Penalty | `[ ] Pass [ ] Fail` |
| **AC-07** | Employees cannot edit or waive a penalty. Only Admin can modify it after OTP/password confirmation. All penalty edits are logged. | Penalty / Access | `[ ] Pass [ ] Fail` |
| **AC-08** | Foreclosure screen correctly displays: remaining months, original interest, interest reduction, bank foreclosure charge, and final payable amount | Foreclosure | `[ ] Pass [ ] Fail` |
| **AC-09** | Daily Summary correctly records and separates cash collections and online payments. UTR numbers are masked for employees and fully visible to Admin. | Daily Summary | `[ ] Pass [ ] Fail` |
| **AC-10** | Role-based access control is enforced server-side: employees cannot access admin functions, sub-IDs are limited to their assigned range, and access can be instantly revoked | Access Control | `[ ] Pass [ ] Fail` |
| **AC-11** | A deleted record can be recovered within the 30-day soft-delete window. No data loss occurs under normal operations or accidental deletion. | Data / Cloud | `[ ] Pass [ ] Fail` |
| **AC-12** | System is accessible from both web browser and mobile device simultaneously with real-time data consistency across all sessions | Platform / Cloud | `[ ] Pass [ ] Fail` |

> **UAT sign-off by Admin is required against all AC items before the final payment milestone is released.**

---

## 10. Glossary

| Term | Definition |
|---|---|
| **EMI** | Equated Monthly Installment — fixed monthly loan repayment amount |
| **RC Number** | Registration Certificate number — unique vehicle identifier |
| **UTR Number** | Unique Transaction Reference — ID for online bank transfers |
| **NOC** | No Objection Certificate — issued to customer after full loan repayment |
| **Foreclosure** | Early closure of a loan before the full tenure, with reduced interest |
| **Seizure** | Physical repossession of a vehicle from a defaulting customer |
| **Grace Period** | Days allowed after EMI due date before penalty is applied |
| **Sub-ID** | Temporary data-entry account with restricted range access, used for bulk historical data migration |
| **OTP** | One-Time Password — used for admin-level action confirmation |

---

*— End of Document —*

> **Document Control:** Version 1.0 Draft | May 2026 | Status: For Review & Approval
