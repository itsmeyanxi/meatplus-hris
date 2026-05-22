# Meatplus HRIS — System Architecture

> **Document owner:** itdevice@meatplus.ph
> **Last updated:** 2026-05-20
> **Status:** Design — pre-implementation

---

## 1. Goals & non-goals

### Goals
- Single in-house system covering: HRIS, attendance, leave, payroll, government reports, employee self-service.
- Full PH labor & tax compliance (BIR, SSS, PhilHealth, Pag-IBIG, DOLE).
- Multi-company / multi-branch ready (Meatplus may operate multiple legal entities).
- Immutable audit trail for all payroll-affecting changes.
- API-first: backend and frontend are decoupled; mobile app is feasible later without re-architecture.

### Non-goals (explicit, to prevent scope creep)
- Not building a generic multi-tenant SaaS for sale (single-customer system; multi-tenant model only because Meatplus has multiple entities).
- No biometric device manufacturing — we import from existing devices via CSV / TCP polling.
- No accounting ledger — we generate journal entries / exports for the accounting system, not replace it.
- No recruitment / ATS in v1 (Phase 7+ if ever).

---

## 2. Design principles

1. **Modular monolith first.** One Laravel application, organized into bounded domains (`HRIS`, `Attendance`, `Leave`, `Payroll`, `Government`). Microservices only if and when scale forces it.
2. **API-first.** Backend exposes versioned REST (`/api/v1`); no server-rendered Blade for the main app UI.
3. **The relational DB is the source of truth.** Redis (when added) is volatile cache; everything durable lives in MySQL.
4. **Money is always `DECIMAL(15,4)`.** Never `FLOAT` / `DOUBLE`. Period.
4a. **All timestamps stored as UTC.** MySQL has no `timestamptz`; we set `app.timezone = 'UTC'`, store in UTC, and convert in the UI layer.
5. **Every payroll-affecting change is auditable.** Field-level diff, who did it, when, why.
6. **Soft delete payroll data.** Hard-delete is forbidden for payslips, payroll runs, gov filings.
7. **Long operations are queued.** HTTP requests return in < 2s; payroll computations run in workers.
8. **Multi-tenant by `company_id`.** Every tenant-scoped table carries `company_id`; global Eloquent scope enforces tenancy.
9. **Compliance over ergonomics.** When DOLE / BIR rules conflict with a "nice" implementation, regulation wins.

---

## 3. Tech stack & rationale

| Layer | Choice | Why this, not the alternative |
| --- | --- | --- |
| Backend | **Laravel 11** (PHP 8.3+) | Mature ecosystem, queues, scheduler, batteries-included. PH dev market knows it. Strong replacement candidates (Django, NestJS) bring no decisive win here. |
| API style | **REST** + Laravel API Resources | Simpler than GraphQL for an internal CRUD-heavy system; well-understood by all stakeholders. |
| Auth | **Laravel Sanctum** | First-party. Supports both SPA (cookie) and token (mobile) modes. JWT is overkill here. |
| RBAC | **spatie/laravel-permission** | Industry standard for Laravel; battle-tested. |
| Audit | **spatie/laravel-activitylog** + custom `payroll_audit_log` | General activity log is noisy; payroll needs a dedicated, append-only, field-diff trail for BIR audits. |
| File mgmt | **spatie/laravel-medialibrary** | Handles 201 file attachments, payslip PDFs, conversions. |
| Frontend | **Next.js 14 (App Router)** | User knows it. Server Components reduce bundle size. Mobile-friendly out of the box. |
| UI library | **shadcn/ui** + Tailwind CSS | Copy-paste components; no vendor lock-in; accessibility built-in. |
| Data fetching | **TanStack Query** | Caching, optimistic updates, request dedup. |
| Forms | **react-hook-form** + **zod** | Type-safe validation shared between client and (optionally) server. |
| Database | **MySQL 8 / MariaDB 10.6+** (XAMPP locally) | `DECIMAL(15,4)` for money is identical to Postgres `NUMERIC`. MySQL `JSON` replaces Postgres `JSONB` (validated JSON, slightly less optimized — acceptable). Standardize all timestamps on **UTC** since MySQL lacks `timestamptz`. Chosen for operational familiarity (phpMyAdmin GUI, XAMPP bundling). |
| Cache / Queue | **Database driver (dev) → Redis 7 (prod)** | Local dev uses MySQL-backed `cache` and `jobs` tables to avoid extra services. Production swaps to Redis once deployed. |
| Search | **MySQL FULLTEXT** | Avoid Elasticsearch operational overhead until scale demands it. |
| File storage | **Local filesystem (dev) → S3 / DO Spaces (prod)** | `storage/app/` for local dev; flysystem S3 driver in prod. |
| PDF | **Laravel-Snappy** (wkhtmltopdf) | Pixel-perfect payslip / BIR form rendering. DomPDF is acceptable fallback. |
| Email | Laravel Mail + **Resend** or **SES** | Transactional emails for payslips, approvals. |
| Local dev | **XAMPP** (Apache + MySQL/MariaDB + phpMyAdmin) on Windows | Already installed; lower friction than Docker. Production still targets Linux + Forge. |
| CI/CD | **GitHub Actions** | Free for private repos at this team size. |
| Production hosting | **Laravel Forge** on DigitalOcean (Singapore region) | Low latency to PH users; sysadmin offloaded to Forge. |

---

## 4. High-level architecture

```
                    ┌─────────────────────────────────────┐
                    │  Browsers (HR admins, employees,    │
                    │  managers — desktop & mobile web)   │
                    └────────────────┬────────────────────┘
                                     │ HTTPS
                                     ▼
                    ┌─────────────────────────────────────┐
                    │   Next.js 14 — App Router           │
                    │   • Server Components               │
                    │   • TanStack Query                  │
                    │   • shadcn/ui + Tailwind            │
                    │   • Auth: Sanctum cookie session    │
                    └────────────────┬────────────────────┘
                                     │ REST /api/v1 (JSON)
                                     ▼
                    ┌─────────────────────────────────────┐
                    │   Laravel 11 — API                  │
                    │  ┌─────────────────────────────────┐│
                    │  │  HTTP Layer (controllers,       ││
                    │  │  resources, form requests)      ││
                    │  └─────────────────────────────────┘│
                    │  ┌─────────────────────────────────┐│
                    │  │  Domain Modules                 ││
                    │  │  HRIS · Attendance · Leave      ││
                    │  │  Payroll Engine · Gov Reports   ││
                    │  └─────────────────────────────────┘│
                    │  ┌─────────────────────────────────┐│
                    │  │  Jobs · Events · Policies       ││
                    │  └─────────────────────────────────┘│
                    └────────┬───────────┬───────────┬────┘
                             │           │           │
                  ┌──────────▼─┐  ┌──────▼────┐  ┌──▼─────────┐
                  │  MySQL 8 / │  │ DB driver │  │  Local FS  │
                  │  MariaDB   │  │  (dev) →  │  │  (dev) →   │
                  │  (XAMPP)   │  │  Redis    │  │  S3 (prod) │
                  └────────────┘  └──────┬────┘  └────────────┘
                                         │
                                  ┌──────▼─────────┐
                                  │ Queue Worker(s)│
                                  │ (payroll runs, │
                                  │  PDF gen,      │
                                  │  gov reports)  │
                                  └────────────────┘
```

---

## 5. Domain modules

```
app/
└── Domain/
    ├── HRIS/             # employees, contracts, org structure
    ├── Attendance/       # schedules, time logs, DTR, OT
    ├── Leave/            # leave types, balances, applications, approvals
    ├── Payroll/          # pay periods, runs, payslips, computation engine
    ├── Government/       # SSS / PhilHealth / Pag-IBIG / BIR brackets + reports
    └── Identity/         # users, roles, permissions, audit (cross-cutting)
```

Each domain owns its: models, services, jobs, events, policies, validators, API controllers. Cross-domain communication is through **events** (e.g., `PayslipFinalized` → triggers employee email notification).

---

## 6. Multi-tenancy

**Strategy:** single database, shared schema, `company_id` foreign key.

- `companies` table is the tenant root.
- Every business table includes `company_id` (NOT NULL, indexed).
- A global Eloquent scope (`CompanyScope`) auto-filters all queries by the authenticated user's active company.
- A user may belong to multiple companies (via `company_user` pivot), and switches active company via UI; the active company is held in the session.
- `super_admin` role bypasses the global scope.

**Why not schema-per-tenant?** Operational complexity (migrations × N schemas), no real isolation benefit at our scale.
**Why not DB-per-tenant?** Same — plus disqualifies cheap managed Postgres tiers.

---

## 7. Authentication & authorization

### Authentication
- Laravel Sanctum.
- Web: SPA cookie session (CSRF-protected).
- Mobile (future): personal access tokens.
- Password policy: min 10 chars, complexity enforced, bcrypt hash.
- Failed-login throttle: 5 attempts / IP / 15 min.
- 2FA (TOTP) — Phase 5+ for HR admins and payroll officers.

### Authorization
- Spatie `laravel-permission`. Roles and permissions are scoped per company.

**Default role set:**

| Role | Scope | Sample capabilities |
| --- | --- | --- |
| `super_admin` | global | Everything across all companies |
| `hr_admin` | company | Manage employees, leaves, attendance, settings |
| `hr_manager` | company | Approve leave, view all dept data, no payroll write |
| `payroll_officer` | company | Run payroll, manage compensation, generate gov reports |
| `dept_head` | dept | Approve own-dept leave, view own-dept attendance |
| `employee` | self | Self-service: own DTR, payslips, file leave |

Permissions are granular (e.g., `payroll.run`, `payroll.approve`, `employee.create`, `leave.approve.self_dept`) and bundled into roles via seeders.

Enforcement: Laravel **Policies** for model authorization + route middleware for coarse gating.

---

## 8. Audit & compliance

Two-tier strategy:

| Tier | Logged via | Stores | Purpose |
| --- | --- | --- | --- |
| 1. General activity | `spatie/laravel-activitylog` | `activity_log` table | Who created/updated/deleted what model. Used for general traceability. |
| 2. Payroll audit | Custom `PayrollAuditLogger` service | `payroll_audit_log` table (append-only) | Field-level diffs on payroll runs, payslips, compensations, contributions. Required for BIR / DOLE audit. |

**Append-only enforcement:** the payroll audit table has no `UPDATE` or `DELETE` privilege granted to the application's DB role.

---

## 9. Background processing

All operations exceeding ~2s of work must be queued.

| Job | Trigger | Driver |
| --- | --- | --- |
| `RunPayrollJob` | Payroll officer clicks "Run" | Redis queue, `payroll` connection |
| `GeneratePayslipPdfJob` | Per employee after payroll run | Redis queue, `pdf` connection |
| `EmailPayslipJob` | After PDF generated | Redis queue, `notifications` connection |
| `ImportBiometricLogsJob` | CSV upload | Redis queue, `imports` connection |
| `GenerateGovReportJob` | HR officer requests BIR / SSS / PHIC / HDMF report | Redis queue, `reports` connection |
| `RecalculateLeaveBalancesJob` | Year-end, leave-type change | Redis queue, `default` |

Queue runner: `supervisor`-managed `php artisan queue:work` workers in production (one worker per connection above).

---

## 10. Security baseline

- HTTPS-only (HSTS).
- All money fields: `DECIMAL(15,4)` — never floats.
- PII at rest: TIN, SSS#, PhilHealth#, Pag-IBIG# are encrypted via Laravel `Crypt::encryptString` (column-level).
- Rate limit: auth endpoints 5/min/IP; general API 60/min/user.
- Input validation: every endpoint uses a Laravel **Form Request**.
- SQL injection: Eloquent + parameterized queries only — `DB::raw()` is forbidden outside reviewed analytics queries.
- XSS: Next.js auto-escapes; backend never returns HTML.
- CSRF: Sanctum SPA mode.
- File uploads: MIME-type whitelist, max 10 MB, antivirus scan optional (Phase 5+).
- Backups: nightly `pg_dump` → encrypted offsite S3 bucket, 30-day rolling retention + monthly snapshots kept 12 months.
- Secrets: `.env` never committed; production secrets in Forge's environment manager.

---

## 11. Repository layout

```
meatplus-hris/
├── backend/                       # Laravel 11
│   ├── app/
│   │   ├── Domain/                # HRIS, Attendance, Leave, Payroll, Government, Identity
│   │   ├── Http/
│   │   ├── Models/                # Base models (light)
│   │   ├── Providers/
│   │   └── Support/
│   ├── bootstrap/
│   ├── config/
│   ├── database/
│   │   ├── factories/
│   │   ├── migrations/
│   │   └── seeders/
│   ├── routes/
│   ├── tests/
│   │   ├── Feature/
│   │   └── Unit/
│   └── composer.json
├── frontend/                      # Next.js 14
│   ├── app/
│   │   ├── (auth)/                # login, forgot password
│   │   ├── (admin)/               # HR admin shell
│   │   │   ├── employees/
│   │   │   ├── attendance/
│   │   │   ├── leave/
│   │   │   ├── payroll/
│   │   │   └── reports/
│   │   ├── (employee)/            # Self-service shell
│   │   └── api/                   # Next.js API routes (BFF if needed)
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives
│   │   └── features/
│   ├── hooks/
│   ├── lib/                       # api client, auth, utils
│   └── package.json
├── docs/
│   ├── 01-architecture.md         # this file
│   ├── 02-database-schema.md
│   └── (more to come)
├── docker/
│   ├── nginx/
│   ├── php/
│   └── postgres/
├── compose.yml                    # docker-compose root
└── README.md
```

---

## 12. Deployment topology

| Environment | Infra |
| --- | --- |
| **Local dev** | XAMPP on Windows: Apache + MySQL/MariaDB + phpMyAdmin. Laravel served as Apache vhost from `backend/public/`. Next.js runs on `node` (port 3000). Cache + queue use MySQL driver; storage = local filesystem; mail = log driver. |
| **Staging** | Single DO droplet (4 GB) via Forge. Nginx + php-fpm + MySQL 8 + Redis + local FS. |
| **Production (initial)** | DO droplet (8 GB CPU-optimized) for app + managed MySQL 8 + managed Redis + DO Spaces (S3). |
| **Production (scaled)** | Add: read replicas, dedicated worker droplet, CDN (BunnyCDN / Cloudflare), separate DB for analytics. |

---

## 13. Observability

| Concern | Tool |
| --- | --- |
| Application logs | Laravel logs → BetterStack (or Papertrail) |
| Errors | Sentry (free tier suffices initially) |
| Uptime | BetterUptime (5 pings: app, API health, queue health, DB, Redis) |
| Performance | Laravel Pulse (first-party, free) |
| DB slow queries | `pg_stat_statements` enabled, weekly review |

---

## 14. Scaling roadmap

| Trigger | Action |
| --- | --- |
| > 50 concurrent users | Profile slow queries, add Redis caching tier for org lookups |
| > 1 000 employees / payroll > 5 min | Chunk payroll job per dept/batch; multiple parallel workers |
| > 5 concurrent payroll runs | Horizontal scale workers; dedicated `payroll` queue connection |
| > 10 000 employees | Read replicas; partition `payslips`, `payslip_items`, `time_logs` by year |
| > 50 000 employees / multi-region | Reconsider monolith — extract Payroll service; introduce event bus |

---

## 15. Open questions / decisions deferred

- [ ] Biometric device model(s) in use at Meatplus — drives integration approach (CSV poll vs. ZKTeco SDK vs. push).
- [ ] Number of legal entities under "Meatplus" — confirms multi-company necessity.
- [ ] Current payroll provider (Sprout? In-house Excel? other?) — drives migration data import scope.
- [ ] Pay frequency policy: semi-monthly, monthly, weekly? Multiple per company?
- [ ] Government remittance method preferred — manual file generation vs. eGov direct submission.
- [ ] Existing accounting system to integrate with (QuickBooks / SAP / Xero / custom)?
