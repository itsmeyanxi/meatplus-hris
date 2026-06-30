# Multi-Tenancy — One Server, Many Companies

> **Status:** Design doc — not yet implemented.

The HRIS serves multiple companies (e.g. MTC, PASEI) from a single server and a single
database. Each company's data is isolated by a `company_id` column on every relevant
table. Users only ever see their own company. Biometric devices from any company can be
read correctly even if an employee from another company scans on them.

---

## Big picture

```
                        ┌─────────────────────────────┐
                        │         ONE SERVER           │
                        │                             │
         ┌──────────────┤   Laravel + Next.js HRIS    ├──────────────┐
         │              │                             │              │
         ▼              └────────────┬────────────────┘              ▼
  ┌─────────────┐                    │                      ┌─────────────┐
  │  MTC ADMIN  │                    ▼                      │ PASEI ADMIN │
  │  (browser)  │        ┌───────────────────────┐         │  (browser)  │
  └─────────────┘        │    ONE DATABASE       │         └─────────────┘
                         │                       │
                         │  companies            │
                         │  ├─ MTC  (id=1)       │
                         │  └─ PASEI (id=2)      │
                         │                       │
                         │  employees            │
                         │  ├─ EMP-0001 (MTC)    │
                         │  ├─ EMP-0002 (MTC)    │
                         │  └─ EMP-0001 (PASEI)  │
                         │                       │
                         │  devices              │
                         │  ├─ MB460 → MTC       │
                         │  └─ MB460 → PASEI     │
                         └───────────────────────┘
```

---

## Database layout

```
companies
┌────┬─────────┬──────────┐
│ id │ name    │ slug     │
├────┼─────────┼──────────┤
│  1 │ MTC     │ mtc      │
│  2 │ PASEI   │ pasei    │
└────┴─────────┴──────────┘

employees                               users
┌────┬────────────┬───────────── ─ ─    ┌────┬────────────┬──────────────┐
│ id │ company_id │ employee_no  ...     │ id │ company_id │ email        │
├────┼────────────┼─────────────         ├────┼────────────┼──────────────┤
│  1 │     1      │ MTC-0001             │  1 │     1      │ hr@mtc.ph    │
│  2 │     1      │ MTC-0002             │  2 │     2      │ hr@pasei.ph  │
│  3 │     2      │ PASEI-0001           └────┴────────────┴──────────────┘
└────┴────────────┴─────────────

devices                                 attendance_logs
┌────┬────────────┬────────────────┐    ┌────┬─────────────┬──────────────────────┐
│ id │ company_id │ serial_no      │    │ id │ employee_id │ punched_at           │
├────┼────────────┼────────────────┤    ├────┼─────────────┼──────────────────────┤
│  1 │     1      │ TTQ5261300001  │    │  1 │      2      │ 2026-06-30 08:02:11  │
│  2 │     2      │ TTQ5261301353  │    └────┴─────────────┴──────────────────────┘
└────┴────────────┴────────────────┘         (no company_id needed — inherited
                                              via employee → company_id)
```

> `attendance_logs` does **not** need its own `company_id` — the employee already
> belongs to a company, so any query that joins through employees is already scoped.

---

## What each user can see

```
MTC HR login                          PASEI HR login
──────────────────────────────────    ──────────────────────────────────
Employees  → only MTC employees       Employees  → only PASEI employees
Attendance → only MTC punches         Attendance → only PASEI punches
Devices    → only MTC devices         Devices    → only PASEI devices
Reports    → only MTC data            Reports    → only PASEI data
```

This is enforced by a **global scope** (automatically added to every query) that
filters by `company_id = auth()->user()->company_id`. No query accidentally
crosses company lines.

---

## How a biometric punch gets attributed

```
  ZKTeco device (PASEI, SN=TTQ5261301353)
         │
         │  POST /iclock/cdata?SN=TTQ5261301353&table=ATTLOG
         │  Body: 2  2026-06-30 08:02:11  1  0  ...
         ▼
  ┌──────────────────────────────────────────────────────────┐
  │  AdmsIngestionService::receive()                         │
  │                                                          │
  │  1. Identify device → company_id = 2 (PASEI)            │
  │  2. Extract biometric PIN from log line → PIN = "2"      │
  │                                                          │
  │  3. Look up employee by PIN — GLOBALLY (no company       │
  │     filter here):                                        │
  │     SELECT * FROM employees                              │
  │       WHERE biometric_user_id = '2'                      │
  │       LIMIT 1                                            │
  │                                                          │
  │  4. Found: Kenth Alfred Condez (MTC, company_id = 1)    │
  │                                                          │
  │  5. Save punch → attendance_logs.employee_id = Kenth's  │
  └──────────────────────────────────────────────────────────┘
         │
         ▼
  MTC HR opens Attendance → sees Kenth's punch ✓
  PASEI HR opens Attendance → does NOT see it  ✓
```

The punch follows the **employee**, not the device. A PASEI device scanning an
MTC employee still records the punch under MTC.

---

## The PIN uniqueness rule

Because the biometric lookup is global, **two employees at different companies cannot
share the same PIN**. If MTC's Kenth is PIN `2` and PASEI also has someone enrolled
as PIN `2`, the lookup is ambiguous.

**Recommended PIN scheme — use a company prefix:**

| Company | PIN format | Example       |
|---------|------------|---------------|
| MTC     | `1` + 4-digit seq | `10001`, `10002` |
| PASEI   | `2` + 4-digit seq | `20001`, `20002` |

Enroll each person on the device using their company-prefixed PIN, then set that
same number as their **Biometric ID** in the HRIS.

> Alternatively, use the numeric portion of their employee number and rely on
> the company prefix in the number range to avoid collisions naturally.

---

## Login and URL

Two options for how companies reach the system:

### Option A — One URL, company selected at login (simpler)

```
https://hris.meatplus.ph/login

  Email:    [ hr@pasei.ph ]
  Password: [ ••••••••   ]
  Company:  [ PASEI ▼    ]   ← dropdown, or auto-detected from email domain

  → system reads company_id from the user record, scopes everything
```

### Option B — Subdomain per company (cleaner separation)

```
https://mtc.hris.meatplus.ph    → company_id resolved from subdomain
https://pasei.hris.meatplus.ph  → company_id resolved from subdomain
```

Subdomain approach requires Nginx/DNS config but gives a cleaner URL and lets
each company bookmark their own address. Recommended once the system goes to
production.

---

## Implementation order (when ready to build)

```
Phase 1 — Database
  [ ] Create companies table + seed MTC, PASEI
  [ ] Add company_id to: users, employees, devices, branches, positions,
      departments, pay_grades (everything tenant-owned)
  [ ] Write migration; add indexes on (company_id, id)

Phase 2 — Scoping
  [ ] CompanyScope global scope → auto-filter queries by company_id
  [ ] Add company_id to logged-in user's JWT / session payload
  [ ] Remove CompanyScope from AdmsIngestionService biometric lookup only
      (punch attribution must stay global)

Phase 3 — Auth
  [ ] Company selector or subdomain resolver at login
  [ ] Super-admin role that can see ALL companies (for Meatplus IT)

Phase 4 — Devices
  [ ] Device registration: assign company_id on first ADMS handshake
      (or manually assign in admin panel)

Phase 5 — Testing
  [ ] Log in as MTC HR → confirm no PASEI data leaks
  [ ] Simulate cross-company scan → confirm punch lands on correct company
```

---

## Super-admin (Meatplus IT)

There should be one role that can switch between companies for support purposes —
the IT admin. This user bypasses `CompanyScope` and can view/manage any company.

```
Super-admin dashboard
  ┌──────────────────────────────────┐
  │  Viewing: [ MTC ▼ ]             │  ← company switcher
  │                                 │
  │  Employees: 129                 │
  │  Devices:   2                   │
  │  ...                            │
  └──────────────────────────────────┘
```

---

## Summary

| Question | Answer |
|---|---|
| Separate databases per company? | No — one DB, scoped by `company_id` |
| Employee numbers unique globally? | No — unique per company only |
| Biometric PINs unique globally? | **Yes — required** (use company prefix) |
| Can a PASEI device clock in an MTC employee correctly? | Yes — lookup is global, punch follows the employee |
| Can PASEI HR see MTC data? | No — CompanyScope blocks it automatically |
| Who can see everything? | Super-admin (Meatplus IT) only |
