# ALL COMPANY HRIS — Architecture

> Living document. It describes the system as it runs **today: self-hosted on the office
> PC**. A few forward-looking items are marked **(planned)**.

## 1. What it is

A multi-company HRIS: employee management, attendance (biometric + web), leave, overtime,
payroll (PH statutory), and role-based access. One central app serves every company and
branch; each branch's biometric device(s) push punches to it.

**Built and in use:** employees (+ CSV/XLSX import/export, per-module upload buttons),
attendance (schedules, holidays, raw time logs, a DTR engine, corrections, and
OT/UT/OB/COA requests), leave (types/balances/applications), overtime, payroll
(semi-monthly + statutory), RBAC, access requests, notifications, and a dashboard.

## 2. Design principles

1. **Modular monolith** — one Laravel app, bounded domains (`Identity`, `HRIS`,
   `Attendance`, `Leave`, `Payroll`, `AccessControl`).
2. **API-first** — versioned REST (`/api/v1`); the Next.js frontend is fully decoupled.
3. **The relational DB is the source of truth.** Cache/queue are volatile.
4. **Money is always `DECIMAL`/`NUMERIC`**, never float.
5. **Multi-tenant by `company_id`** — every tenant-scoped table carries it; a global
   Eloquent scope enforces it.
6. **Idempotent, offline-tolerant ingestion** — devices may buffer and re-send.
7. **Compliance over ergonomics** — PH labor/tax rules win over convenience.

## 3. Topology (as deployed)

Everything runs on one Windows PC (Laragon stack) and is published to the internet through
the Next.js server itself. Branch biometric devices push in from wherever they are.

```
   BIOMETRIC DEVICES (any branch / any network)
        │  ADMS push  →  http://allcompanyhris.meatplus.ph/iclock/...
        ▼
 ┌───────────────────────────── office PC ─────────────────────────────┐
 │                                                                      │
 │   Next.js (:80, public entry point; proxies via next.config.mjs)    │
 │     ├─ /api/*  /sanctum/*  /up             ─▶ Laravel :8000         │
 │     ├─ /iclock/*                           ─▶ Laravel :8001         │
 │     │                                         (device traffic only)  │
 │     └─ everything else                     ─▶ the Next app itself    │
 │                                                   │                  │
 │                            Laravel workers ───────┴──▶ PostgreSQL 17 │
 │                            (php artisan serve)         Laragon :5433 │
 │                                                        db meatplus_hris│
 └──────────────────────────────────────────────────────────────────────┘
        ▲
        │  HTTP + JSON (Sanctum session cookie)
   Browsers: HR, payroll, managers, employees — any company, any branch
```

- **Device traffic is isolated from user traffic.** `php artisan serve` serves one request
  at a time, so punches go to `:8001` and the UI to `:8000` — a burst from the terminals
  cannot block someone loading a page, and vice versa.
- **No load balancer today.** Caddy used to round-robin the pool and health-check it on
  `/up`, but Smart App Control blocks the unsigned binary, so Next.js holds port 80 instead.
  Workers `:8002`/`:8003` still start but receive nothing; if `:8000` dies, the UI is down
  until the pool is restarted. Restoring Caddy needs a signed build.
- Devices push **outbound**, so no server is needed at each branch and no inbound access
  into branch LANs is required.
- HTTPS/443 is **parked** — the site is HTTP by design for now (see
  [06-deployment-hosting.md](06-deployment-hosting.md)).

## 4. Components

| Component | Tech | Responsibility |
|---|---|---|
| Web frontend | Next.js 16, TypeScript, TanStack Query, Tailwind | All user UIs; talks to the API |
| API / app server | Laravel 11 (PHP 8.3), DDD layout, run as a 4-worker pool | Business logic, ingestion, auth, REST API |
| Database | PostgreSQL 17 (Laragon); code also runs on MySQL | System of record |
| Public entry point | Next.js (`:80`) with server-side rewrites | Serves the app and proxies `/api`, `/sanctum`, `/up`, `/iclock` to the Laravel pool |
| Ingestion | `routes/iclock.php` → `IclockController` → `AdmsIngestionService` | Receive ADMS punches from devices |
| Auth | Sanctum (cookie/session), Spatie Permission (teams) | User auth; devices authorized by serial allowlist |

## 5. Domain model (`app/Domain/*`)

- **Identity** — `Company`, `Branch`, `User`, company↔user membership, `CompanyScope`.
- **HRIS** — `Employee` (+ dependents, education, emergency contacts, employment history,
  government IDs, bank accounts, contracts) and org structure (`Department`, `Position`,
  `EmploymentType`).
- **Attendance** — `AttendanceDevice`, `TimeLog`, `DailyTimeRecord` (DTR),
  `WorkSchedule`/`WorkScheduleDay`, `EmployeeSchedule`, `Holiday`, `ShiftAdjustment`, and
  request types (overtime / undertime / official-business / certificate-of-attendance /
  correction). Key services: `DtrComputer`, `AdmsIngestionService`, `GeofenceService`.
- **Leave** — `LeaveType`, `LeaveBalance`, `LeaveApplication`, `LeaveBalanceService`.
- **Payroll** — `EmployeeCompensation`, `PayrollRun`, `Payslip`; `PayrollComputer`,
  `StatutoryCalculator`.
- **AccessControl** — `AccessRequest` + supervisor → HR → IT approval workflow.

The HTTP layer (`app/Http/*`) exposes these as `/api/v1/...` with FormRequest validation
and API Resources.

## 6. Tenancy & access

- **Company = tenant.** Spatie Permission runs in **teams mode** with the team =
  `company_id`, so roles/permissions are per company.
- **Branch** is a sub-unit of a company; employees, devices, and holidays carry
  `branch_id` and can be filtered by it.
- **`CompanyScope`** auto-filters most models by the actor's `active_company_id`;
  **IT Admin** bypasses it.
- Admins can belong to every company and keep their roles when switching; a user in more
  than one company chooses which to enter at login. Full role reference:
  [03-permissions.md](03-permissions.md).

## 7. Request / auth flow

1. Frontend fetches a CSRF cookie (`/sanctum/csrf-cookie`), then `POST /api/v1/login`.
2. Sanctum issues a **stateful session cookie**; later requests are cookie-authenticated.
3. Middleware sets the Spatie team to the user's `active_company_id`.
4. Authorization is enforced in FormRequests / controllers via `can(...)`.
5. The browser auto-signs-out after 15 minutes of inactivity.

## 8. Biometric ingestion (ADMS)

The capture protocol is **decoupled** from the rest of the system; only the ingestion
adapter is vendor-specific.

```
Device scan → ADMS POST /iclock/cdata → AdmsIngestionService → TimeLog
                    │                                              │
          serial allowlist check                    DtrComputer → DailyTimeRecord → Payroll
                    │
          map device PIN → employee (biometric_user_id, else employee_no)
```

**Identity mapping** — each person is enrolled on the device under a numeric **PIN**. The
server maps it to `employee.biometric_user_id` (fallback: `employee_no`), scoped to the
device's company. A PIN that matches nobody is **staged in `unmatched_punches`**, not
dropped: `attendance:reclaim-unmatched` runs every 15 minutes and converts staged rows into
real punches the moment that PIN maps to someone, then recomputes the affected DTRs. So
attendance that arrives before the person exists in the HRIS is recoverable rather than lost.

**The `employee_no` fallback has a failure mode worth knowing.** If someone is re-enrolled
under a new PIN and their old employee number is then reused on the device for a *different*
person, that person's punches land on the original employee's record. `BiometricAnomalyDetector`
looks for exactly this and opens a reviewable row; see
[09-alerts-and-notifications.md](09-alerts-and-notifications.md).

**Security** — devices **auto-register by serial** on first contact but land **inactive**;
their punches are **rejected until an admin activates the serial** and assigns its company.
This serial allowlist is what makes exposing `/iclock` to the internet safe against forged
punches from unknown terminals. Every raw request is logged to `storage/logs/iclock.log`.

**Guarantees**
- **Idempotent** — punches dedupe on `(device_id, source_event_id)`, so device replays are
  harmless.
- **Timezone** — stored per device; punches normalized to the device's local time.
- **Offline tolerance** — devices buffer scans and re-send; dedup absorbs the replays.
- **Bounded recompute** — after ingest (and on approval of leave/OT/corrections), only the
  affected employee + date range is re-run through `DtrComputer`.

Operator guide: [05-biometric.md](05-biometric.md).

## 9. Key data stores

| Table | Holds |
|---|---|
| `companies`, `branches`, `users`, `company_user` | tenancy & accounts |
| `employees` (+ sub-tables), `departments`, `positions`, `employment_types` | HR records & org |
| `attendance_devices` | device registry (serial, company, branch, timezone) |
| `time_logs` | raw punches (append-only; idempotent) |
| `daily_time_records` | computed daily summary (hours, late, OT, night-diff, leave) |
| `work_schedules`/`_days`, `employee_schedules`, `holidays`, `shift_adjustments` | schedule inputs |
| `leave_types`, `leave_balances`, `leave_applications` | leave |
| `overtime_requests` (+ undertime/OB/COA/corrections) | attendance requests |
| `employee_compensations`, `payroll_runs`, `payslips` | payroll |
| `permissions`, `roles`, `model_has_roles`, … | RBAC |

Full definitions: [02-database-schema.md](02-database-schema.md).

## 10. Reliability & scale

- **Worker pool** — 4 Laravel workers start, but with Caddy out of the path only `:8000`
  (users) and `:8001` (devices) receive traffic. The split still buys the important part:
  a flood of punches can't starve the UI. What it no longer buys is failover — see the
  topology note above.
- **Idempotent ingestion** — safe device retries; no double punches.
- **Bounded recompute** — DTR re-runs only affected employee+date ranges.
- **Indexes** on hot columns (`employee_id`, `work_date`, `logged_at`, `company_id`).
- **Local DB** — sub-millisecond queries (vs the old ~145 ms to cloud Postgres).

## 11. Security posture

- **RBAC** — team-scoped Spatie permissions; IT-Admin escalation guarded.
- **Device auth** — serial allowlist (inactive-by-default); credentials encrypted at rest.
- **User auth** — Sanctum cookie/session; CORS locked to the frontend origin; 15-minute
  idle logout.
- **Secrets** — environment-based; none in version control.
- **Current gap** — traffic is **HTTP** until 443/HTTPS is enabled; browser GPS features
  (geofenced web check-in) stay off until then. See [06-deployment-hosting.md](06-deployment-hosting.md).

## 12. Roadmap (not yet built)

HTTPS/443 cutover • printable/PDF payslips + employee self-service • loans/other
deductions, 13th-month, government remittance reports • reporting & analytics • audit
logging (activitylog installed, unused) • per-device push tokens • production hardening
(2FA, password policy, tests/CI).
