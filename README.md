# Meatplus HRIS

Internal HR / Payroll / Attendance / Leave system for Meatplus PH.

Modeled functionally after Sprout Solutions — built in-house for full control over PH compliance (BIR, SSS, PhilHealth, Pag-IBIG, DOLE) and to eliminate vendor licensing costs.

---

## Status

**Phase 0 — Foundation:** complete (backend + frontend verified end-to-end).

Build phases:
- [x] Phase 0 — Auth, RBAC, audit base, company/branch/user models
- [x] Phase 1.0 — Org structure + employee 201 core (employees, gov IDs, contracts, bank accounts)
- [x] Phase 1.1 — Employee soft data (dependents, emergency contacts, education, employment history) — surfaced as tabs under `/employees/[id]/{tab}`
- [ ] Phase 1.2 — Employee documents (Spatie MediaLibrary, file upload, type whitelist)
- [x] Phase 2.0 — Attendance core: work schedules, holidays, time logs, DTR engine (computes hours/late/UT/OT/rest day/holiday/absent)
- [x] Phase 2.1 — OT + OB + correction approval workflows (file → approve/reject/cancel with state guards)
- [x] Phase 2.2 — Self-service: employees log in to file their OWN requests; added undertime + certificate of attendance request types; role-aware UI; dept-head approver scoping
- [x] Phase 2.3 — User provisioning UI: `/users` admin page (list, edit role, reset password, deactivate) + "Provision login" button on employee detail
- [ ] Phase 2.1b — Auto-apply approved corrections to DTR + integrate approved OT into DTR engine
- [ ] Phase 2.4 — Biometric device CSV import + ZKTeco/Anviz polling
- [x] Phase 3.0 — Leave management: 10 PH leave types seeded, balance tracking (auto-decrement on approve / restore on cancel), single-step approval with gender restrictions + min lead time + max consecutive day rules
- [ ] Phase 3.1 — Multi-step approval chain (dept_head → HR) + leave type editing UI + accrual jobs
- [ ] Phase 4 — Payroll engine + PH tax tables
- [ ] Phase 5 — Government reports
- [ ] Phase 6 — Employee self-service portal

## Stack

| Layer | Technology |
| --- | --- |
| Backend API | Laravel 11 (PHP 8.2+) |
| Frontend | Next.js 14 (App Router) + Tailwind + shadcn/ui |
| Database | MySQL 8 / MariaDB 10.4+ (XAMPP locally) |
| Auth | Laravel Sanctum (SPA cookie session) |
| RBAC | spatie/laravel-permission (teams mode, `company_id` as team key) |
| Audit | spatie/laravel-activitylog + custom `payroll_audit_log` (append-only) |
| Cache / Queue | Database driver (dev) → Redis 7 (prod) |
| File storage | Local FS (dev) → S3 / DO Spaces (prod) |
| Local dev | XAMPP (Apache + MariaDB + phpMyAdmin) |
| Hosting (proposed) | Laravel Forge on DigitalOcean Singapore |

## Documentation

- [`docs/01-architecture.md`](docs/01-architecture.md) — system architecture, tech stack rationale, security, deployment
- [`docs/02-database-schema.md`](docs/02-database-schema.md) — full database schema across all modules

---

## Local development

### Prerequisites
- **PHP 8.2+** (XAMPP 8.2 ships with PHP 8.2)
- **Composer 2.x** — installed user-locally at `%USERPROFILE%\bin\composer.phar`; add `%USERPROFILE%\bin` to PATH or call `php %USERPROFILE%\bin\composer.phar`
- **MariaDB on port 3307** (XAMPP) — NOT 3306 (port 3306 is taken by `doliwampmysqld` service on this host)
- **Node** (24.x found on this host; any 18+ works for Next.js 14) — `C:\Program Files\nodejs\` is in system PATH but new shells may need a restart to pick it up

### One-time setup
```sql
-- In phpMyAdmin → SQL tab, as root:
CREATE DATABASE IF NOT EXISTS meatplus_hris CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'meatplus_app'@'localhost' IDENTIFIED BY 'Pass456';
GRANT ALL PRIVILEGES ON meatplus_hris.* TO 'meatplus_app'@'localhost';
FLUSH PRIVILEGES;
```

### Run the backend
```powershell
cd backend
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

Visit `http://localhost:8000/up` — should return 200 with a green health check page.

### Run the frontend
```powershell
cd frontend
npm run dev
```

Open `http://localhost:3000` (use `localhost`, NOT `127.0.0.1` — the session cookie's domain is `localhost`).

### Seeded users (both passwords `changeme` — change before any non-local use)

| Email | Role | Linked employee |
| --- | --- | --- |
| `itdevice@meatplus.ph` | `super_admin` | — |
| `juan.delacruz@meatplus.ph` | `employee` | EMP-0001 Juan Dela Cruz |

Test self-service by logging in as Juan: he files/cancels his own requests, can't approve any, sees only his own rows. The super_admin sees everything, can file on behalf of any employee, and approves any pending request (except their own).

### API smoke test (PowerShell)
```powershell
Add-Type -AssemblyName System.Web
$base = "http://localhost:8000"
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$null = Invoke-WebRequest "$base/sanctum/csrf-cookie" -WebSession $s -UseBasicParsing
$xsrf = [System.Web.HttpUtility]::UrlDecode(($s.Cookies.GetCookies($base) | ? Name -eq "XSRF-TOKEN").Value)
$body = @{ email="itdevice@meatplus.ph"; password="changeme" } | ConvertTo-Json
Invoke-RestMethod "$base/api/v1/login" -Method POST -Body $body `
  -ContentType "application/json" -WebSession $s `
  -Headers @{ "X-XSRF-TOKEN"=$xsrf; "Accept"="application/json"; "Referer"="http://localhost:3000" }
Invoke-RestMethod "$base/api/v1/me" -WebSession $s `
  -Headers @{ "Accept"="application/json"; "Referer"="http://localhost:3000" }
```

---

## Backend layout

```
backend/
├── app/
│   ├── Domain/                       # bounded domains
│   │   ├── Identity/                 # Company, Branch, CompanyScope, BelongsToCompany trait
│   │   ├── HRIS/                     # (Phase 1) employees, contracts, org
│   │   ├── Attendance/               # (Phase 2)
│   │   ├── Leave/                    # (Phase 3)
│   │   ├── Payroll/                  # (Phase 4)
│   │   └── Government/               # (Phase 5)
│   ├── Http/
│   │   ├── Controllers/Api/V1/       # versioned API controllers
│   │   └── Middleware/
│   │       └── SetPermissionsTeam.php  # sets Spatie team context per request
│   └── Models/
│       └── User.php                  # HasApiTokens + HasRoles + SoftDeletes
├── config/
│   ├── permission.php                # teams=true, team_foreign_key=company_id
│   ├── sanctum.php
│   └── cors.php                      # allows FRONTEND_URL with credentials
├── database/
│   ├── migrations/                   # 13 migrations covering Phase 0
│   └── seeders/                      # Company, Permissions, SuperAdmin
└── routes/
    └── api.php                       # /api/v1/{login,logout,me,companies/switch}
```

## Auth flow (Sanctum SPA mode)

1. Frontend calls `GET /sanctum/csrf-cookie` — receives `XSRF-TOKEN` cookie.
2. Frontend calls `POST /api/v1/login` with `email` + `password`, including `X-XSRF-TOKEN` header (decoded from the cookie value).
3. Backend creates a session (`meatplus_hris_session` cookie). All subsequent requests carry both cookies and are authenticated automatically.
4. `GET /api/v1/me` returns user, active company, roles, permissions.
5. `POST /api/v1/companies/switch` changes `active_company_id` (also updates Spatie team context).
6. `POST /api/v1/logout` ends the session.
