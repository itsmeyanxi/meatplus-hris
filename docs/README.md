# ALL COMPANY HRIS — Documentation

A multi-company Human Resource Information System: **employees, attendance (biometric +
web), leave, overtime, payroll, and role-based access**. One central app serves every
company and branch; each branch's biometric device pushes its punches to the server.

**Stack**

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, TanStack Query, Tailwind |
| Backend | Laravel 12 (PHP 8.3), domain-driven (`app/Domain/*`), REST API at `/api/v1` |
| Database | PostgreSQL 17 (self-hosted, Laragon) |
| Biometric | ZKTeco terminals via the **ADMS push** protocol |

**How it runs today (self-hosted).** Everything runs on the office PC and is reachable at
`http://allcompanyhris.meatplus.ph`:

```
Internet ─▶ Caddy (:80)  ─┬─▶  Next.js  (:3001)                 ← the web app
                          └─▶  Laravel pool (:8000–:8003)        ← /api, /sanctum, /up, /iclock
                                     │
                                     ▼
                          PostgreSQL 17 (Laragon, :5433, db meatplus_hris)
```

Caddy load-balances four Laravel workers (health-checked on `/up`). HTTPS/443 is not yet
enabled — the site is intentionally HTTP for now. See
[04-operations.md](04-operations.md) and [06-deployment-hosting.md](06-deployment-hosting.md).

---

## Index

| # | Document | What's inside |
|---|---|---|
| 01 | [Architecture](01-architecture.md) | System design, domains, tenancy, auth, biometric ingestion, reliability |
| 02 | [Database schema](02-database-schema.md) | Table-by-table schema + MySQL⇄Postgres portability |
| 03 | [Permissions & access](03-permissions.md) | The roles, the permission glossary, and role × capability |
| 04 | [Operations](04-operations.md) | Run it, deploy changes, back it up — the day-to-day runbook |
| 05 | [Biometric (ZKTeco / ADMS)](05-biometric.md) | Connect a device, enroll people, troubleshoot punches |
| 06 | [Deployment & hosting](06-deployment-hosting.md) | How the self-hosting works (Caddy, DNS, router, HTTPS-later, hardening) |
| 07 | [Employee accounts](07-employee-accounts.md) | Give employees a login — bulk invite, single invite, direct provision |
| 08 | [Backend walkthrough](08-backend-walkthrough.md) | Read the code: request lifecycle, domain layout, the two invariants, the three engines |

---

## Quick start

```powershell
# From the project root, start the whole production stack (DB, backend pool, frontend, Caddy):
.\start-production.ps1
```

Then open **http://localhost:3001** (local) or **http://allcompanyhris.meatplus.ph** (public).
Full details, including the one-time setup and how to auto-start at logon, are in
[04-operations.md](04-operations.md). To connect a biometric device, see
[05-biometric.md](05-biometric.md).

## Repository layout

```
meatplus-hris/
├─ backend/                  Laravel API
│  ├─ app/Domain/            Identity · HRIS · Attendance · Leave · Payroll · AccessControl
│  ├─ app/Http/              Controllers, FormRequests, API Resources (REST /api/v1)
│  ├─ routes/iclock.php      ZKTeco ADMS push endpoints (no auth middleware; serial-allowlisted)
│  └─ database/              migrations + seeders (PermissionsSeeder = RBAC source of truth)
├─ frontend/                 Next.js 16 app (App Router)
├─ docs/                     ← you are here
├─ Caddyfile                 reverse proxy: frontend + backend pool
├─ start-production.ps1      starts Postgres + 4 backend workers + frontend + Caddy
└─ backup-db.ps1             database backups
```

> **Convention:** the **code is the source of truth**. When a doc disagrees with the code,
> fix the doc. `PermissionsSeeder.php` defines roles; the Laravel migrations define the schema.
