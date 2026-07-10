# Meatplus HRIS — Software Architecture

> **Status:** living document. Sections marked **(planned)** are target-state, not yet built.
> **Current deployment (2026-07-10):** the web app runs on **Render** (Singapore) against
> **Supabase Postgres** (`ap-southeast-1`), the single source of truth. The office PC runs
> the Laravel backend on a Laragon stack so the **ZKTeco device can push punches** to it on
> the LAN; those writes go to Supabase. Offline MySQL/Postgres copies of the data sit on
> that PC — see [09-local-database.md](09-local-database.md). The code is driver-agnostic
> (Postgres + MySQL). The ZKTeco ADMS receiver is **built**.

## 0. Design principles & non-goals

**Principles**
1. **Modular monolith first** — one Laravel app, bounded domains (`HRIS`, `Attendance`,
   `Leave`, `Payroll`, `Identity`, `AccessControl`). Microservices only if scale forces it.
2. **API-first** — versioned REST (`/api/v1`); the Next.js frontend is fully decoupled
   (a mobile client is feasible later without re-architecture).
3. **The relational DB is the source of truth.** Cache/queue are volatile.
4. **Money is always `DECIMAL`/`NUMERIC`**, never float.
5. **Multi-tenant by `company_id`** — every tenant-scoped table carries it; a global
   Eloquent scope enforces tenancy.
6. **Long operations are queued** — HTTP returns fast; heavy work (DTR recompute,
   payroll) runs in workers.
7. **Idempotent, offline-tolerant ingestion** — devices may buffer and re-send.
8. **Compliance over ergonomics** — when PH labor/tax rules conflict with a "nice"
   implementation, regulation wins.

**Non-goals** — not a generic SaaS for resale (single customer, multi-entity); not a
device manufacturer (we ingest from existing terminals); not an accounting ledger (we
export journal entries, not replace the books); no recruitment/ATS in v1.

## 1. Purpose & scope

A Human Resource Information System for Meatplus: employee management, attendance
(biometric + manual), leave, payroll, and role-based access — designed to run
**centrally in the cloud** and serve **multiple branches/locations**, each with its
own biometric device(s).

Core capabilities (built): employees (+ CSV/XLSX import/export), attendance
(schedules, holidays, time logs, DTR engine, corrections, OT/UT/OB/COA requests),
leave (types/balances/applications), payroll (semi-monthly + PH statutory),
RBAC, access requests, notifications, dashboard.

## 2. Architectural goals & constraints

- **Single source of truth** — all branches' data in one central database.
- **Distributed capture** — biometric devices live on separate branch LANs.
- **No inbound access to branches** — a central server can't reach `192.168.x.x`
  at each branch, so **devices push data outward** to the center (see ADMS, §8).
- **Multi-company / multi-branch tenancy** with scoped access.
- **Cloud-hostable** with a **minimal local footprint** per branch (ideally none).
- **Idempotent, offline-tolerant ingestion** — devices may buffer and re-send.

## 3. High-level topology

```
   BRANCH A                 BRANCH B                 BRANCH C
 ┌──────────┐             ┌──────────┐             ┌──────────┐
 │ Biometric│             │ Biometric│             │ Biometric│
 │ device(s)│             │ device(s)│             │ device(s)│
 └────┬─────┘             └────┬─────┘             └────┬─────┘
      │ ADMS push (HTTPS)      │                        │
      └───────────────┬───────┴────────────────────────┘
                      ▼
            ┌─────────────────────┐        ┌────────────────────┐
            │   Central API        │  uses  │  PostgreSQL        │
            │   (Laravel)          │◄──────►│  (Supabase / mgd)  │
            │  - ingestion         │        └────────────────────┘
            │  - DTR engine        │        ┌────────────────────┐
            │  - payroll, leave    │  jobs  │  Queue + Workers   │
            │  - RBAC / auth       │◄──────►│  (recompute, mail) │
            └──────────┬──────────┘        └────────────────────┘
                       ▲  HTTPS / JSON (Sanctum cookie)
                       │
            ┌──────────┴──────────┐
            │  Web frontend        │  ← HR, payroll, managers, employees
            │  (Next.js, hosted)   │     (any branch, any browser)
            └─────────────────────┘
```

Per branch: just the device(s) pushing out. No branch server required when devices
speak ADMS (§8). A small local **sync agent** is only needed for pull-only devices.

## 4. Components

| Component | Tech | Responsibility |
|---|---|---|
| Web frontend | Next.js 16 (App Router), TypeScript, TanStack Query, Tailwind | All user UIs; talks to the API over HTTPS |
| API / app server | Laravel (PHP 8.3), DDD layout | Business logic, ingestion, auth, REST API |
| Database | PostgreSQL (Supabase); MySQL also supported | System of record |
| Ingestion layer | Laravel controllers + adapters | Receive punches from devices (ADMS push / ISAPI pull) |
| Background workers | Queue (Redis or DB driver) | DTR recompute, payroll compute, notifications, mail |
| File storage | S3-compatible / Supabase Storage | Attachments, payslip PDFs *(planned)*, imports |
| Auth | Sanctum (cookie/session) | User auth; device auth by serial + token |

## 5. Domain model (DDD modules)

The backend is organized by domain under `app/Domain/*`:

- **Identity** — `Company`, `Branch`, `User`, company↔user membership, `CompanyScope`.
- **HRIS** — `Employee` (+ dependents, education, emergency contacts, employment
  history, government IDs, bank accounts, contracts), org structure
  (`Department`, `Position`, `EmploymentType`).
- **Attendance** — `AttendanceDevice`, `TimeLog`, `DailyTimeRecord` (DTR),
  `WorkSchedule`/`WorkScheduleDay`, `EmployeeSchedule`, `Holiday`,
  `ShiftAdjustment`, request types (overtime/undertime/official-business/
  certificate-of-attendance/correction). Services: `DtrComputer`,
  `AttendanceCorrectionApplier`, biometric `HikvisionIsapiClient` + `BiometricSyncService`.
- **Leave** — `LeaveType`, `LeaveBalance`, `LeaveApplication`, `LeaveBalanceService`.
- **Payroll** — `EmployeeCompensation`, `PayrollRun`, `Payslip`. Services:
  `PayrollComputer`, `StatutoryCalculator`.
- **AccessControl** — `AccessRequest` + supervisor→HR→IT approval workflow.

The web/HTTP layer (`app/Http/*`) exposes these as a versioned REST API
(`/api/v1/...`) with FormRequest validation and API Resources.

## 6. Tenancy & access model

- **Company = tenant.** Spatie Permission runs in **teams mode** with the team =
  `company_id`; roles/permissions are scoped per company.
- **Branch** is a sub-unit of a company; employees, devices, and holidays carry
  `branch_id`; data and reports can be filtered by branch.
- **`CompanyScope`** global scope auto-filters most models by the actor's
  `active_company_id`; **IT Admin** bypasses it (top-level administrator).
- **Roles** (13): it_admin (full), hr_admin, payroll_officer, dept_head,
  supervisor, team_lead, dept_admin, timekeeper, hr_coordinator, transport_access,
  sales_employee, garahe_teamlead, employee — each a permission set.
- **"View as role"** lets IT Admin preview any role's navigation/access.

## 7. Request / auth flow

1. Frontend gets a CSRF cookie (`/sanctum/csrf-cookie`), then `POST /api/v1/login`.
2. Sanctum issues a **stateful session cookie**; subsequent requests are
   cookie-authenticated, with the active company resolved per request.
3. Permission middleware sets the Spatie team to `active_company_id`.
4. Authorization is enforced in FormRequests / controllers via `can(...)`.

## 8. Biometric attendance — data flow & ingestion

The capture protocol is **decoupled** from the rest of the system; only the
ingestion adapter is vendor-specific.

```
Device scan → [ingestion adapter] → TimeLog → DtrComputer → DailyTimeRecord → Payroll
                                       │
                          map device PIN → employee.biometric_user_id
```

**Enrollment / identity mapping**
- Each person is enrolled on the device under a numeric **PIN / "Employee No."**.
- The sync maps that to `employee.biometric_user_id` (fallback: `employee_no`).
- Unmatched scans are reported as *unmapped* and skipped — never lost.

**Ingestion adapters**
- **ADMS push (built — ZKTeco; current production path):** the device is configured
  with the server URL and **POSTs attendance records to it** (the `iclock/cdata`
  protocol). Works outbound through any branch firewall/NAT; **no per-branch server
  needed.** Implemented in `routes/iclock.php` (middleware-free), `IclockController`,
  and `AdmsIngestionService`. Devices **auto-register by serial** on first contact and
  every raw request is logged to `storage/logs/iclock.log`. Hardware in use: **ZKTeco
  MB460**. See [06-biometric-zkteco.md](06-biometric-zkteco.md).
- **ISAPI pull (legacy/optional — Hikvision):** the server *pulls* events from the
  device by IP over ISAPI (`HikvisionIsapiClient` + `BiometricSyncService`). Requires
  the server to reach the device LAN, so it's only for on-site/test use.

**Guarantees**
- **Idempotent** — punches are deduped on `(device_id, source_event_id)`.
- **Direction** — from the device's attendance status (check-in/out/break) when
  provided, else inferred by daily alternation.
- **Timezone** — stored per device; punches normalized to the device's local time.
- **Offline tolerance** — devices buffer scans and re-send; dedup absorbs replays.
- **Recompute** — after ingest (and on approval of leave/OT/corrections), the
  affected employee+date range is re-run through `DtrComputer`.

**Device registry & auth**
- `attendance_devices` holds each device (branch, vendor, serial, timezone,
  credentials encrypted at rest).
- Devices authenticate by **serial number + a registration/token** *(token: planned)*.

## 9. Key data stores

| Table | Holds |
|---|---|
| `companies`, `branches`, `users`, `company_user` | tenancy & accounts |
| `employees` (+ sub-tables), `departments`, `positions`, `employment_types` | HR records & org |
| `attendance_devices` | device registry (per branch) |
| `time_logs` | raw punches (append-only; idempotent) |
| `daily_time_records` | computed daily summary (hours, late, OT, night-diff, leave) |
| `work_schedules`/`_days`, `employee_schedules`, `holidays`, `shift_adjustments` | schedule inputs |
| `leave_types`, `leave_balances`, `leave_applications` | leave |
| `employee_compensations`, `payroll_runs`, `payslips` | payroll |
| `permissions`, `roles`, `model_has_roles`, … | RBAC |
| `notifications`, `access_requests*` | notifications & access workflow |

## 10. Security

- **Transport:** HTTPS everywhere (devices → API, browser → API).
- **User auth:** Sanctum cookie/session; CORS locked to the frontend origin.
- **RBAC:** team-scoped Spatie permissions; IT-Admin escalation guarded.
- **Device auth:** serial + token *(planned)*; device credentials encrypted at rest.
- **Secrets:** environment-based; no secrets in VCS.
- **Hardening (planned):** force-reset of shared seed passwords, password policy,
  2FA, account lockout, audit logging (activitylog is installed but unused).

## 11. Reliability & scale

- **Stateless API** → scales horizontally behind a load balancer.
- **Queue workers** for heavy/async work (DTR recompute, payroll, mail).
- **Idempotent ingestion** → safe device retries; no double punches.
- **Indexes** on hot columns (`employee_id`, `work_date`, `logged_at`, `company_id`).
- **Recompute is bounded** to affected employee+date ranges, not full rebuilds.
- **Branch isolation of failure** — one branch's device/network issue doesn't
  affect others; its scans simply arrive when connectivity returns.

## 12. Environments & delivery

- **Local dev / current run:** a **Laragon** stack (PHP 8.3 + Node) on Windows.
  `start-servers.ps1` launches the Laravel API (`php artisan serve --host=0.0.0.0`, so the
  biometric device can reach it on the LAN) and the Next.js frontend on `:3001`. The database is
  **Supabase Postgres** (cloud). See [04-setup-supabase-laragon.md](04-setup-supabase-laragon.md).
- **Staging / production (planned):** Next.js hosted (e.g., Vercel); Laravel on a
  managed PHP host (PHP-FPM/Octane); queue worker; scheduled tasks (`schedule:run`).
- **CI/CD (planned):** automated tests + deploy pipeline.

## 13. Tech stack

- **Backend:** Laravel (PHP 8.3), Sanctum, Spatie Permission (teams), openspout
  (CSV/XLSX), domain-driven layout.
- **Frontend:** Next.js 16 (App Router), TypeScript, TanStack Query, Tailwind, sonner.
- **Database:** PostgreSQL (**Supabase**, `ap-southeast-1`) — **live**. The codebase is
  driver-agnostic (Postgres + MySQL) via a `likeOperator()` helper (ILIKE/LIKE),
  driver-aware migrations (`ALTER COLUMN` vs `MODIFY`), and `DB_SSLMODE`. Offline MySQL
  and PostgreSQL copies of the data sit on the office PC. See
  [09-local-database.md](09-local-database.md).
- **Async:** queue (database driver today; Redis in prod) + scheduler.

## 14. Migration path (progress)

1. **DB → Supabase Postgres — ✅ done.** Ported to Postgres (driver-aware migrations,
   ILIKE/LIKE). On 2026-07-10 the data was copied down to a local MySQL and back again;
   Supabase remains the source of truth, because a cloud web app cannot reach a database
   on the office PC. The local copies are snapshots. See
   [09-local-database.md](09-local-database.md).
2. **Devices → ADMS — ✅ done (receiver).** ADMS endpoint built; ZKTeco MB460 in
   onboarding (point device at the server, enroll employees: PIN ↔ `biometric_user_id`).
3. **App hosting — ⏳ planned.** Deploy Laravel to a managed PHP host (PHP-FPM/Octane);
   enable a queue worker + scheduler.
4. **Frontend hosting — ⏳ planned.** Deploy and point at the hosted API origin via an
   env-driven backend URL (replace the `localhost:8000` proxy).
5. **Cutover — ⏳ planned.** Run parallel, verify attendance/payroll, then go cloud-hosted
   so the app is reachable from any browser.

## 15. Open decisions

- **Database host:** Supabase Postgres (recommended) vs other managed Postgres/MySQL.
- **App host:** Laravel Cloud / Railway / Render / VPS.
- **Frontend host:** Vercel / Netlify / same host.
- **Biometric device vendor/model** (determines exact ADMS protocol variant).
- **Queue driver:** Redis vs database.

## 16. Roadmap (not yet built)

Org-structure admin (departments/positions/branches) • employee government IDs + bank
accounts UI • printable/PDF payslips + employee self-service • loans/other deductions,
13th-month, gov remittance reports • reporting & analytics • audit logging (activitylog
installed, unused) • per-device push tokens + disable auto-register • production hardening
(2FA, password policy, force-reset of shared seed passwords, tests/CI, real mail/queue).
