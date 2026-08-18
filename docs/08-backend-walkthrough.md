# Backend walkthrough

> A guided tour of the Laravel backend for someone reading it for the first time.
> Where [01-architecture.md](01-architecture.md) describes the system as a design,
> this one walks the code in the order it actually executes.

**Laravel 11.53 · PHP 8.3 · PostgreSQL 17 · ~260 PHP files · 111 migrations · 6 domains**

---

## 1. The shape of it

One Laravel app — a **modular monolith**. Not microservices, and it renders no HTML.
It is a pure JSON API at `/api/v1`; the Next.js frontend is a separate program that
talks to it over HTTP.

Three consequences worth holding onto:

- **The database is the truth.** Cache and queue are disposable; Postgres is not.
- **Money is always `DECIMAL`**, never a float. Drift in payroll is a labour complaint.
- **Every tenant row carries `company_id`**, enforced by a global scope. This is the
  single most important rule in the codebase.

---

## 2. What happens on a request

Every browser call walks the same short path. Learn it once and every endpoint becomes
predictable.

```
trustProxies          trusts the upstream proxy (real scheme + IP)
      ↓
statefulApi           Sanctum COOKIE session — not bearer tokens
      ↓
SetPermissionsTeam    pins Spatie's "team" to your active_company_id
      ↓
auth:sanctum          rejects anonymous callers
      ↓
Controller            permission → validate → service → Resource   (~75 of these)
      ↓
throttle:api          per-user rate cap
TrackUserActivity     "online now" heartbeat (last_seen_at)
```

All of it is wired in one file: [`bootstrap/app.php`](../backend/bootstrap/app.php).
There are only **two** custom middleware classes in the whole project —
[`SetPermissionsTeam`](../backend/app/Http/Middleware/SetPermissionsTeam.php) and
[`TrackUserActivity`](../backend/app/Http/Middleware/TrackUserActivity.php). Almost
nothing lives in middleware; the logic is in controllers and domain services.

> **One route group skips all of it.**
> [`routes/iclock.php`](../backend/routes/iclock.php) runs with *no middleware at all* —
> no auth, no CSRF, no session — because a ZKTeco terminal cannot hold a session cookie.
> It is protected by a **device serial allowlist** instead: an unknown serial
> self-registers as inactive and its punches are rejected until an admin approves it.
> That is what makes exposing the endpoint to the internet survivable.
> See [05-biometric.md](05-biometric.md).

---

## 3. Where the code lives

Organised by business domain, not by Laravel convention.

```
app/
  Domain/            ← the real logic lives here
    Identity/        Company, Branch, CompanyScope, BelongsToCompany
    HRIS/            Employee (+22 satellite models), Department, Position
    Attendance/      TimeLog, DailyTimeRecord, WorkSchedule, Holiday,
                     OT / UT / OB / COA request types
    Leave/           LeaveType, LeaveBalance, LeaveApplication
    Payroll/         Compensation, PayrollRun, Payslip, loans, adjustments
    AccessControl/   AccessRequest + supervisor → HR → IT approval chain

  Http/
    Controllers/Api/V1/<Area>/   ~75 thin controllers
    Requests/                    FormRequest validation
    Resources/                   JSON output shaping

  Models/            only User + Invitation
  Console/Commands/  11 artisan commands
```

`app/Models` holding just two classes is the tell: **anything owned by a company lives
in `app/Domain/*/Models`** and inherits multi-tenancy automatically. `User` and
`Invitation` sit outside because they are not company-scoped in the same way.

---

## 4. Rule one — tenancy

Any model using the `BelongsToCompany` trait gets a global query scope plus an automatic
`company_id` stamp on create. From
[`CompanyScope.php`](../backend/app/Domain/Identity/Scopes/CompanyScope.php):

```php
if ($user->active_company_id) {
    $builder->where($model->getTable().'.company_id', $user->active_company_id);
} else {
    // No active company → fail CLOSED, never open.
    $builder->whereRaw('1 = 0');
}
```

Two details that matter more than they look:

- **It fails closed.** No active company returns *nothing*, not everything. The dangerous
  bug here would be a scope that silently applies no filter.
- **It binds everyone**, including `super_admin`. Seeing another company's data requires
  actually *switching* companies. A role's power is over what you may **do**, never over
  what you may **see**.

When code must genuinely cross that line it says so out loud with `withoutGlobalScopes()`.
You will see it wherever a manager's own employee record, or their cross-company reports,
must survive a company switch.

See [03-permissions.md](03-permissions.md) for the role and permission glossary.

---

## 5. Rule two — permissions

One hook in [`AppServiceProvider::boot()`](../backend/app/Providers/AppServiceProvider.php)
governs the whole authorization system:

```php
Gate::before(function ($user, string $ability) {
    if ($user->isSuperAdmin()) return true;   // bypasses everything
    if ($user->isItAdmin())    return true;   // bypasses everything
    if ($user->hasPermissionTo($ability)) return true;
    return null;
});
```

Everyone else falls through to a named permission. There is no policy layer — controllers
check permission strings inline:

```php
abort_unless($request->user()->can('employee.view'), 403);
```

**The subtlety:** Spatie roles are scoped to a "team", and here a team *is* a company.
That is why `SetPermissionsTeam` must run before any `->can()` call. Get the ordering
wrong and permissions silently evaluate against the wrong company.

---

## 6. The controller pattern

Roughly 75 controllers, one shape.
[`EmployeeController`](../backend/app/Http/Controllers/Api/V1/Employees/EmployeeController.php)
is the canonical example.

| Step | What it looks like |
|---|---|
| **Gate** | `abort_unless(…->can('employee.view'), 403)` |
| **Validate** | A FormRequest class, or an inline `$request->validate([…])` |
| **Query** | Built in a private helper such as `filteredQuery()`, eager loads spelled out |
| **Delegate** | Anything heavy goes to a `Domain/*/Services` class |
| **Shape** | Return an API Resource, never a raw model |

One habit worth copying from it: `likeOperator()` switches between `ILIKE` and `LIKE`,
because the code is written to run on both PostgreSQL and MySQL.

---

## 7. The three engines

Almost all of the real complexity is concentrated in three service classes.

### DtrComputer — the heart of the system

[`app/Domain/Attendance/Services/DtrComputer.php`](../backend/app/Domain/Attendance/Services/DtrComputer.php) · 646 lines

Collapses raw punches, schedules, holidays, leave and approved OT/OB/COA into exactly one
`DailyTimeRecord` per employee per day. It is idempotent — `updateOrCreate`, and it skips
rows marked `locked` — which is why it is safe to call from everywhere: ingestion,
approvals, holiday edits, schedule changes.

The interesting logic is in its guards, each of which exists because of a real failure:

| Constant | Value | Why it exists |
|---|---|---|
| `MAX_SHIFT_MINUTES` | 16 h | A missing out-punch would otherwise pair with the *next* shift and invent a 24-hour day |
| `MIN_SHIFT_MINUTES` | 30 m | Two punches minutes apart are a double-tap at arrival, not a clock-out |
| `OFF_SCHEDULE_MINUTES` | 6 h | A rotating worker on the "wrong" schedule still gets their hours, but is not billed as late |
| `LATE_GRACE_MINUTES` | 15 m | Arriving within the allowance is not late at all |

Three behaviours worth memorising:

- **Punches belong to a shift, not a calendar day.** `groupPunchesByShiftDay()` credits a
  2 AM clock-out to the evening the shift began.
- **Absence is only judged for days that have fully elapsed.** Today is still in progress,
  so it can never be "absent".
- **Overtime is never earned by staying late.** Only a filed *and* approved OT request
  credits OT — with one exception: rest-day and holiday work, which is how those days get
  paid at all.

### PayrollComputer — cutoff to payslip

[`app/Domain/Payroll/Services/PayrollComputer.php`](../backend/app/Domain/Payroll/Services/PayrollComputer.php) · 421 lines

Reads the DTRs for a cutoff and writes `Payslip` rows. Semi-monthly: monthly figures are
computed then halved. Two design decisions to know:

- **Compute is re-runnable** — it deletes and recreates all payslips each time.
- **Loan balances are only drawn down at *post* time**, from the stored breakdown. That
  separation is deliberate: recomputing must never double-collect a loan.

Philippine statutory tables (SSS, PhilHealth, Pag-IBIG, withholding tax) live next door in
`StatutoryCalculator`. Premium pay stacks per DOLE — regular holiday +100%, rest day or
special non-working day +30%, and combinations add.

### AdmsIngestionService — punches arriving from the field

[`app/Domain/Attendance/Services/Biometric/AdmsIngestionService.php`](../backend/app/Domain/Attendance/Services/Biometric/AdmsIngestionService.php)

ZKTeco terminals POST tab-separated `ATTLOG` rows over the open `/iclock` endpoint. Three
properties make that safe and lossless:

- **Allowlisted** — unknown serials register as inactive and their punches are *rejected*
  until an admin approves the device and assigns its company.
- **Idempotent** — `firstOrCreate` on `(device_id, source_event_id)`, so a device
  re-sending its buffer creates no duplicates.
- **Lossless** — a punch whose PIN maps to nobody is staged in `unmatched_punches` rather
  than dropped, and reclaimed automatically once that PIN is mapped.

---

## 8. Approval workflows — five modules, one trait

Overtime, undertime, official business, certificate of attendance and attendance
corrections are near-identical resources. Their routes are generated in a `foreach` loop in
[`routes/api.php`](../backend/routes/api.php), and their shared behaviour lives in one trait:
[`HandlesApprovalWorkflow`](../backend/app/Http/Controllers/Concerns/HandlesApprovalWorkflow.php).

- List scoping by role — HR sees all, a department head sees their scope, everyone else
  sees only their own
- **Nobody can approve their own request**, ever
- Approver scope = the subject's direct manager *or* the head of their department
- On decision, the affected day's DTR is recomputed immediately
- Filing notifies the manager, the department head and global approvers — resolved across
  companies, so a cross-company supervisor is still reached

Read that one trait and you understand all five modules.

---

## 9. Work that runs itself

Four scheduled jobs, defined in [`routes/console.php`](../backend/routes/console.php):

| Job | Cadence | Purpose |
|---|---|---|
| `attendance:sync-biometric` | 5 min | Poll terminals for new punches |
| `attendance:reclaim-unmatched` | 15 min | Attach staged punches once their PIN maps |
| `attendance:detect-biometric-anomalies` | 06:30 | Flag PIN-reuse collisions to HR |
| `employees:detect-data-issues` | 06:45 | One digest of missing payroll/attendance data |

Plus eleven manual artisan commands under
[`app/Console/Commands/`](../backend/app/Console/Commands/) for syncs, imports and one-off
repairs. The queue runs on `database`; cache and session are plain files.

Day-to-day operation of these is in [04-operations.md](04-operations.md).

---

## 10. Traps to know

**Routes are cached in production.** `bootstrap/cache/routes-v7.php` exists, so a newly
added route returns 404 no matter how correct the code is. Run `php artisan route:cache`
after adding one. Config is cached the same way — `php artisan config:cache` after editing
`.env.production`.

**PHP changes are live immediately.** OPcache is off for the CLI SAPI the workers run
under, so editing a controller takes effect on the next request, with no restart. Frontend
changes are the opposite: they need a full rebuild (`deploy-frontend.ps1`).

**There is effectively no test suite.** `tests/` holds only the two Laravel example tests.
Nothing catches a regression for you — which is why the domain services carry unusually
thorough comments explaining *why* each guard exists. Treat those comments as the
specification, and verify changes against real data before shipping.

**Government IDs and bank account numbers are encrypted at rest** by the model. Never
raw-insert them with the query builder — a bypassed mutator makes the row unreadable and
the next read throws.

**Names render surname-first everywhere.** `Employee::formatName()` is the single source
of that format; never hand-concatenate first + last. The one exception is
`full_name_first_last`, reserved for bank account names and prose addressed to a person.

---

## 11. Where to start reading

In this order, the system explains itself:

| # | File | What it teaches |
|---|---|---|
| 1 | [`Domain/Identity/Scopes/CompanyScope.php`](../backend/app/Domain/Identity/Scopes/CompanyScope.php) | How tenants stay apart |
| 2 | [`Domain/Identity/Concerns/BelongsToCompany.php`](../backend/app/Domain/Identity/Concerns/BelongsToCompany.php) | How a model opts into that |
| 3 | [`Providers/AppServiceProvider.php`](../backend/app/Providers/AppServiceProvider.php) | Authorization, rate limits, password policy |
| 4 | [`Api/V1/Employees/EmployeeController.php`](../backend/app/Http/Controllers/Api/V1/Employees/EmployeeController.php) | The controller pattern, in full |
| 5 | [`Concerns/HandlesApprovalWorkflow.php`](../backend/app/Http/Controllers/Concerns/HandlesApprovalWorkflow.php) | Five approval modules at once |
| 6 | [`Domain/Attendance/Services/DtrComputer.php`](../backend/app/Domain/Attendance/Services/DtrComputer.php) | The hardest logic in the system |
| 7 | [`Domain/Payroll/Services/PayrollComputer.php`](../backend/app/Domain/Payroll/Services/PayrollComputer.php) | How attendance becomes money |

Next: [02-database-schema.md](02-database-schema.md) for the table-by-table schema.
