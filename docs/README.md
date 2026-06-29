# Meatplus HRIS — Documentation

A Human Resource Information System for Meatplus: **employees, attendance (biometric +
manual), leave, payroll, and role-based access** — built to run centrally and serve
multiple branches, each with its own biometric device(s).

- **Backend:** Laravel (PHP 8.3), domain-driven (`app/Domain/*`), versioned REST API (`/api/v1`)
- **Frontend:** Next.js 16 (App Router), TypeScript, TanStack Query, Tailwind
- **Database:** PostgreSQL — **Supabase** (`ap-southeast-1`)
- **Biometric:** ZKTeco **MB460** via the **ADMS push** protocol
- **Runs on:** a local **Laragon** stack today (`start-app.bat`); cloud-hosted is the target

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

---

## Quick start

1. **Run the app:** double-click `start-app.bat` (project root). It launches the Laravel
   API on `:8000` (host `0.0.0.0` so the biometric device can reach it) and the Next.js
   frontend on `:3000`. Open <http://localhost:3000>.
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
└─ start-app.bat            one-click local startup (Laragon)
```

## Current status (2026-06)

- ✅ Migrated to **Supabase Postgres**; codebase is driver-agnostic (Postgres + MySQL)
- ✅ **ZKTeco ADMS receiver** built — device auto-registers by serial; raw pushes logged
- ✅ Frontend served as a **production build** for speed
- ⏳ Cloud hosting (so the app is reachable from any browser) — planned
- ⏳ Device onboarding (MB460) — in progress

> **Conventions:** files are numbered for reading order. The **code is the ultimate source
> of truth** — when a doc and the code disagree, fix the doc. `PermissionsSeeder.php` defines
> roles; the Laravel migrations define the schema.
