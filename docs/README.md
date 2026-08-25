# ALL COMPANY HRIS — Documentation

A multi-company Human Resource Information System: **employees, attendance (biometric +
web), leave, overtime, payroll, and role-based access**. One central app serves every
company and branch; each branch's biometric device pushes its punches to the server.

**Stack**

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, TanStack Query, Tailwind |
| Backend | Laravel 11 (PHP 8.3), domain-driven (`app/Domain/*`), REST API at `/api/v1` |
| Database | PostgreSQL 17 (self-hosted, Laragon) |
| Biometric | ZKTeco terminals via the **ADMS push** protocol |

**How it runs today (self-hosted).** Everything runs on the office PC and is reachable at
`http://allcompanyhris.meatplus.ph`:

```
Internet ─▶ Next.js (:80)  ─┬─▶  /api  /sanctum  /up  ─▶ Laravel :8000
   & LAN     the public       ├─▶  /iclock/*           ─▶ Laravel :8001  ← devices only
             entry point      └─▶  everything else     ─▶ the Next app itself
                                          │
                                          ▼
                            PostgreSQL 17 (Laragon, :5433, db meatplus_hris)
```

**Next.js serves port 80 directly** and proxies the backend paths to the Laravel pool
(`frontend/next.config.mjs`). Device pushes are deliberately routed to a *different* worker
than user traffic: `php artisan serve` handles one request at a time, so a burst of punches
can't block the UI.

> **Caddy is no longer in the path.** It used to hold port 80, but Windows Smart App Control
> blocks the unsigned `tools\caddy.exe` ("An Application Control policy has blocked this
> file"). `Caddyfile` and the binary are still in the repo but unused, and
> `start-production.ps1` has `$useCaddy = $false`. Restoring it needs a *signed* Caddy build,
> and the frontend port moved back to 3001. Until then there is no load balancer and no
> `/up` health-check rotation — workers `:8002`/`:8003` start but nothing routes to them.

HTTPS/443 is not enabled — the site is intentionally HTTP for now. See
[04-operations.md](04-operations.md) and [06-deployment-hosting.md](06-deployment-hosting.md).

---

## Index

| # | Document | What's inside |
|---|---|---|
| 00 | [System overview](00-system-overview.md) | Plain English, no code — what the system is and does. **Start here if you're not a developer.** |
| 01 | [Architecture](01-architecture.md) | System design, domains, tenancy, auth, biometric ingestion, reliability |
| 02 | [Database schema](02-database-schema.md) | Table-by-table schema + MySQL⇄Postgres portability |
| 03 | [Permissions & access](03-permissions.md) | The roles, the permission glossary, and role × capability |
| 04 | [Operations](04-operations.md) | Run it, deploy changes, back it up — the day-to-day runbook |
| 05 | [Biometric (ZKTeco / ADMS)](05-biometric.md) | Connect a device, enroll people, troubleshoot punches |
| 06 | [Deployment & hosting](06-deployment-hosting.md) | How the self-hosting works (Caddy, DNS, router, HTTPS-later, hardening) |
| 07 | [Employee accounts](07-employee-accounts.md) | Give employees a login — bulk invite, single invite, direct provision |
| 08 | [Backend walkthrough](08-backend-walkthrough.md) | Read the code: request lifecycle, domain layout, the two invariants, the three engines |
| 09 | [Alerts & notifications](09-alerts-and-notifications.md) | What the system tells people, when, and through which channel |
| 10 | [**System turnover**](10-system-turnover.md) | **The complete handover document** — overview, architecture, DB, modules, workflows, roles, API, deployment, environment, backup/recovery, known issues, code structure, scheduled jobs, security, maintenance, ownership |

> Documents 01–09 go deep on one topic each. **Document 10 is the single self-contained
> reference** for maintenance, onboarding, or handing the system to another team — start there
> if you are new or taking ownership. Screenshots live in
> [screenshots/](screenshots/README.md), which lists exactly what to capture and what must be
> redacted first.

**Word version.** Document 10 is also maintained as
`docs/ALL-COMPANY-HRIS-System-Turnover.docx` (31 pages, A4) for circulation to management and
external parties. **The markdown is the source of truth** — edit `10-system-turnover.md`, then
regenerate:

```powershell
.\docs\tools\build-turnover-docx.ps1
```

The conversion turns the mermaid diagrams into ASCII art (mermaid source is unreadable in
Word) and each screenshot link into a labelled placeholder box, so images can be pasted
straight into the document. Requires Node and Microsoft Word; both are on the production PC.

---

## Quick start

```powershell
# From the project root, start the whole production stack (DB, backend pool, frontend):
.\start-production.ps1
```

Then open **http://localhost** (local) or **http://allcompanyhris.meatplus.ph** (public).
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
│  ├─ routes/console.php     the scheduler — every recurring job lives here
│  └─ database/              migrations + seeders (PermissionsSeeder = RBAC source of truth)
├─ frontend/                 Next.js 16 app (App Router); next.config.mjs proxies the backend
├─ docs/                     ← you are here
├─ tools/                    scheduler + watchdog installers, maintenance page, caddy.exe (unused)
├─ start-production.ps1      starts Postgres + 4 backend workers + queue worker + frontend
├─ deploy-frontend.ps1       rebuild + restart the frontend behind a maintenance page
├─ sync-attendance.ps1       nightly attendance close-out (absences)
├─ Caddyfile                 UNUSED — kept for the day a signed Caddy build is available
└─ backup-db.ps1             database backups
```

> **Convention:** the **code is the source of truth**. When a doc disagrees with the code,
> fix the doc. `PermissionsSeeder.php` defines roles; the Laravel migrations define the schema.
