# Meatplus HRIS — Plain-English System Guide

> **Who this is for:** Anyone who needs to understand what this system is and does, without being a programmer. Read this top-to-bottom and you'll be able to explain the system to other people.
>
> **Where to find this file:** `docs/00-system-overview.md` inside the project folder
> (`Documents\meatplus-hris\docs`). It sits next to the two technical docs, `01-architecture.md` and `02-database-schema.md`.

---

## 1. What is this system, in one sentence?

It's an **in-house HR system** ("HRIS" = Human Resources Information System) that Meatplus built for itself to handle **employee records, attendance, leaves, and payroll** — replacing the paid outside service (Sprout Solutions) the company used before, and following Philippine government rules (BIR, SSS, PhilHealth, Pag-IBIG, DOLE).

Think of it as the company's single source of truth for **"who works here, when they worked, what time off they took, and how much they get paid."**

---

## 2. What can it actually do? (The main parts)

The system is organized into a handful of major areas. Here's each one in plain terms:

| Area | What it's for |
|---|---|
| **Employee records (the "201 file")** | The full profile of every employee: personal info, government IDs (SSS, TIN, PhilHealth, Pag-IBIG), contracts, bank accounts, dependents, emergency contacts, education, job history, and company assets they hold. |
| **Attendance / Timekeeping** | Tracks when people clock in and out. Punches come from **biometric machines** at each branch and from the **web time clock**. The system then calculates hours worked, lates, undertime, overtime, rest days, holidays, and absences automatically. |
| **Attendance requests** | Employees file requests and managers approve them: Overtime (OT), Official Business (OB), Undertime (UT), Certificate of Attendance (COA), and time corrections. |
| **Leaves** | Filing and approving time off. The system tracks each person's leave balance, subtracts approved leaves, and restores them if a leave is cancelled. Supports the Philippine leave types and paid-vs-unpaid choices. |
| **Payroll** | Calculates salaries twice a month (semi-monthly): base pay, overtime, night differential, holiday premiums, government deductions, loans, and adjustments — then produces payslips and a bank file. |
| **Reports** | Exports data for management and government, including a timekeeping export that matches the company's manual template. |
| **Devices** | Manages the biometric machines (fingerprint/face terminals) at each branch. |
| **Users & Access** | Controls who can log in and what they're allowed to see or do (see roles below). |
| **Audit trail** | A permanent log of who did what, for accountability — especially around payroll. |

Everyone also gets **self-service**: employees can clock in/out from a browser, view their own attendance, see their payslips, and see their team.

---

## 3. Who uses it, and what are they allowed to do? (Roles)

Not everyone sees everything. Each login is given a **role** that decides what they can access. The important ones:

**Top administrators**
- **super_admin** — The most powerful account. Can see and do everything across *all* companies. (One exception: it still can't open *confidential* employee files unless it's also given the HR Confidential role.)
- **admin** — Runs one company: full HR, payroll, attendance, and leave — but can't manage companies or assign roles.
- **it_admin** — Full technical access, but limited to one company.

**HR roles**
- **HR Confidential (hr_confi)** — The **only** role that can open confidential employees' pay and bank details. This is a deliberate wall: not even a super_admin sees these without this role.
- **hr_admin / hr_officer / hr_coordinator** — HR work at decreasing levels of access (managing employees, attendance, and leaves), but *without* the confidential data.

**Other roles**
- **payroll_officer** — Runs and posts payroll, manages pay and government reports.
- **it_staff** — Day-to-day IT support: biometric devices and user accounts.
- **dept_head / supervisor / team_lead** — Approve their team's attendance and leave requests.
- **employee** — Self-service only: files their own leaves and requests, sees only their own information.

> **Key idea — the "active company":** The business runs several companies. A user works in one company at a time (their "active company") and only sees that company's data. They can switch between companies they belong to. The super_admin is the exception — it sees all companies at once.

---

## 4. How is it built? (The simple version)

The system is really **two programs that talk to each other**:

1. **The back end** — the "engine room." It holds all the data, does the calculations (payroll, timekeeping), and enforces the rules. Built with **Laravel** (a PHP framework). It stores everything in a **PostgreSQL database**.

2. **The front end** — the "dashboard" people actually click on in their browser. Built with **Next.js / React**. It doesn't hold the data itself; it asks the back end for it.

They communicate through an **API** — think of it as a waiter carrying requests from the screen to the engine room and bringing answers back.

```
  Employee's browser  ──►  Front end (the screens)  ──►  Back end (engine + rules)  ──►  Database (the records)
        │                                                        ▲
  Biometric machine  ─────────────────────────────────────────┘
     at each branch          (punches sent straight to the engine)
```

**A few practical facts:**
- **Biometric machines push data on their own.** The fingerprint/face terminals at each branch send punches directly to the system over the internet. Branches don't need any special incoming access — the devices reach out, not the other way around.
- **It runs on the company's own hardware**, not a rented cloud server. Live changes are deployed on office machines (Laragon), so publishing code isn't automatic — someone runs a deploy step.
- **Money is handled carefully.** Payroll amounts are stored as exact decimals (never rounded floats), and payroll actions are written to a permanent audit log for compliance.

---

## 5. How the project folder is organized

If someone opens the project folder (`Documents\meatplus-hris`), here's what the main folders are:

| Folder | What's inside |
|---|---|
| `backend/` | The engine room (Laravel). The data, the rules, and the calculations live here. |
| `frontend/` | The screens people click on (Next.js). |
| `docs/` | Documentation. **This file** plus the technical architecture and database docs. |
| `backups/` | Database backups. |
| Loose `.ps1` files at the top | Operational scripts for starting, deploying, and backing up the system. |

For the curious, deeper landmarks:
- **What data exists →** `backend/database/migrations/` (the schema history) and `docs/02-database-schema.md`.
- **Who can do what →** `backend/database/seeders/PermissionsSeeder.php` (the roles and permissions).
- **The screens map to features →** `frontend/src/app/` — each folder is roughly one feature (employees, attendance, leaves, payroll, etc.).
- **The best technical narrative →** `docs/01-architecture.md`.

---

## 6. A short glossary

- **HRIS** — Human Resources Information System (this whole thing).
- **API** — the messenger that lets the screens and the engine talk.
- **DTR** — Daily Time Record. The computed daily summary of a person's hours (worked, late, overtime, absent, etc.).
- **Biometric device** — the fingerprint/face terminal at a branch that records clock-in/clock-out.
- **Semi-monthly** — payroll runs twice a month, the standard Philippine cycle.
- **Multi-company / tenant** — the system holds several companies in one place, keeping each company's data separate.
- **Role / permission** — a role (like "HR Officer") is a bundle of permissions that decides what a user can see and do.
- **Confidential employee** — an employee whose pay and bank details are walled off to the single HR Confidential role.
- **Laravel / Next.js / PostgreSQL** — the back-end framework, the front-end framework, and the database, respectively.

---

## 7. How to explain it to someone in 30 seconds

> "It's the company's own HR system. It keeps every employee's records, pulls attendance from the biometric machines at each branch, tracks leaves, and runs payroll twice a month following Philippine government rules. Different staff get different access — HR, payroll, IT, managers, and regular employees each see only what they should. It replaced the paid Sprout service we used before."

---

*Last written: 2026-08-12. If features change, this overview should be updated alongside the technical docs in the `docs/` folder.*
