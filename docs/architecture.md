# Meatplus HRIS — Software Architecture

> Status: living document. Sections marked **(planned)** are target-state, not yet built.

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
| Database | PostgreSQL (Supabase or managed) | System of record |
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
- **ADMS push (target for production — ZKTeco-style devices):** the device is
  configured with the central server URL and **POSTs attendance records to it**
  (the `iclock/cdata` protocol). Works outbound through any branch firewall/NAT;
  **no per-branch server needed.** The server also pushes time-sync + user
  commands back on the device's poll. *(planned — build when hardware is chosen)*
- **ISAPI pull (current, test only — Hikvision):** the server *pulls* events from
  the device by IP over ISAPI. Requires the server to reach the device LAN, so
  it's used with a local agent or only for on-site testing.

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

- **Local dev:** Next.js dev server + `php artisan serve` (current).
- **Staging / production (planned):** Next.js hosted (e.g., Vercel); Laravel on a
  managed PHP host; managed Postgres; queue worker; scheduled tasks
  (`schedule:run`) for periodic jobs.
- **CI/CD (planned):** automated tests + deploy pipeline.

## 13. Tech stack

- **Backend:** Laravel (PHP 8.3), Sanctum, Spatie Permission (teams), openspout
  (CSV/XLSX), domain-driven layout.
- **Frontend:** Next.js 16 (App Router), TypeScript, TanStack Query, Tailwind, sonner.
- **Database:** PostgreSQL (Supabase) — *target*; MySQL today.
- **Async:** queue (Redis or database driver) + scheduler.

## 14. Migration path (from current state)

1. **DB:** provision managed Postgres (Supabase); port the few MySQL-specific bits
   (raw `ALTER TABLE … MODIFY` statements → Postgres `ALTER COLUMN`), then migrate
   schema + data.
2. **App:** deploy Laravel to a managed PHP host; move secrets to env; enable a
   queue worker + scheduler.
3. **Frontend:** deploy and point at the hosted API origin (replace the
   hardcoded `localhost:8000` proxy with an env-driven backend URL).
4. **Devices:** standardize on the chosen ADMS device; build the ADMS endpoint;
   register devices per branch; enroll employees (PIN ↔ `biometric_user_id`).
5. **Cutover:** run parallel, verify attendance/payroll, then retire XAMPP/MySQL.

## 15. Open decisions

- **Database host:** Supabase Postgres (recommended) vs other managed Postgres/MySQL.
- **App host:** Laravel Cloud / Railway / Render / VPS.
- **Frontend host:** Vercel / Netlify / same host.
- **Biometric device vendor/model** (determines exact ADMS protocol variant).
- **Queue driver:** Redis vs database.

## 16. Roadmap (not yet built)

ADMS ingestion endpoint • org-structure admin (departments/positions/branches) •
employee government IDs + bank accounts UI • printable/PDF payslips + employee
self-service • loans/other deductions, 13th-month, gov remittance reports •
reporting & analytics • audit logging • production hardening (2FA, password policy,
tests/CI, real mail/queue).
