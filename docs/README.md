# Meatplus HRIS — Documentation

A Human Resource Information System for Meatplus: **employees, attendance (biometric +
manual), leave, payroll, and role-based access** — built to run centrally and serve
multiple branches, each with its own biometric device(s).

- **Backend:** Laravel (PHP 8.3), domain-driven (`app/Domain/*`), versioned REST API (`/api/v1`)
- **Frontend:** Next.js 16 (App Router), TypeScript, TanStack Query, Tailwind
- **Database:** PostgreSQL — **Supabase** (`ap-southeast-1`), the single source of truth. See [09-local-database.md](09-local-database.md)
- **Biometric:** ZKTeco **MB460** via the **ADMS push** protocol — pushes to the office PC, which writes to Supabase
- **Runs on:** **Render** (web app) + a **Laragon** backend on the office PC for device ingestion

---

## Index

| # | Document | What's inside |
|---|---|---|
| 01 | [Architecture](01-architecture.md) | System design, topology, components, tenancy, ingestion, security, roadmap |
| 02 | [Database schema](02-database-schema.md) | Canonical table-by-table schema + MySQL⇄Postgres portability |
| 03 | [Permissions & access](03-permissions.md) | The 13 roles, the permission glossary, and exact role × capability |
| 04 | [Setup — Supabase + Laragon](04-setup-supabase-laragon.md) | Beginner step-by-step to get the app running locally |
| 05 | [Supabase migration](05-supabase-migration.md) | Technical reference for the MySQL → Postgres move |
| 06 | [Biometric — ZKTeco/ADMS](06-biometric-zkteco.md) | Connect the MB460, enroll people, troubleshoot punches |
| 07 | [Deployment & performance](07-deployment-performance.md) | Go-live checklist, DB latency, production hardening |
| 08 | [Multi-tenancy](08-multi-tenancy.md) | Single DB, `company_id` scoping |
| 09 | [Databases & backups](09-local-database.md) | Which database is live, the offline copies, `backup-db.ps1`, portability traps |

---

## Quick start

1. **Run the app:** run `.\start-servers.ps1` (project root). It launches the Laravel
   API on `:8000` (host `0.0.0.0` so the biometric device can reach it) and the Next.js
   frontend on `:3001`. Open <http://localhost:3001>.
   To have it start automatically at logon, run `.\register-autostart.ps1` once.
2. **Set up the database:** follow [04-setup-supabase-laragon.md](04-setup-supabase-laragon.md).
3. **Connect the biometric device:** follow [06-biometric-zkteco.md](06-biometric-zkteco.md).

## Repository layout

```
meatplus-hris/
├─ backend/                 Laravel API
│  ├─ app/Domain/           Identity · HRIS · Attendance · Leave · Payroll · AccessControl
│  ├─ app/Http/             Controllers, FormRequests, API Resources (REST /api/v1)
│  ├─ routes/iclock.php     ZKTeco ADMS push endpoints (no middleware)
│  └─ database/             migrations + seeders (PermissionsSeeder = RBAC source of truth)
├─ frontend/                Next.js 16 app (App Router)
├─ docs/                    ← you are here
├─ start-servers.ps1        local startup: Laravel :8000 + Next.js :3001
└─ register-autostart.ps1   registers start-servers.ps1 as a logon task
```

## Current status (2026-06)

- ✅ Migrated to **Supabase Postgres**; codebase is driver-agnostic (Postgres + MySQL)
- ✅ **ZKTeco ADMS receiver** built — device auto-registers by serial; raw pushes logged
- ✅ Frontend runs in **dev mode** (`npm run dev`) on `:3001`; a production build is the
  faster option for staging/prod — see [07-deployment-performance.md](07-deployment-performance.md)
- ⏳ Cloud hosting (so the app is reachable from any browser) — planned
- ⏳ Device onboarding (MB460) — in progress

> **Conventions:** files are numbered for reading order. The **code is the ultimate source
> of truth** — when a doc and the code disagree, fix the doc. `PermissionsSeeder.php` defines
> roles; the Laravel migrations define the schema.
