# Migrating to Supabase (Postgres) + Laragon

> 📜 **Historical (superseded 2026-07-10).** This move was completed, then reversed —
> the database now runs on **local MySQL 8.4** in Laragon. See
> [09-local-database.md](09-local-database.md). Kept because the driver-agnostic work it
> describes (ILIKE/LIKE, driver-aware migrations, `DB_SSLMODE`) is still in the codebase
> and is what made moving back possible.

Goal: run the app on **Laragon** (local PHP runtime, replacing XAMPP) with the
database on **Supabase Postgres** (cloud) instead of local MySQL.

The codebase has been made **database-agnostic** (works on MySQL *and* Postgres),
so this is now an infrastructure/config exercise.

---

## What was already done in code (✅)

- `relax_employee_required_fields_for_import` migration is now **driver-aware**
  (`ALTER COLUMN … DROP NOT NULL` on Postgres, `MODIFY` on MySQL).
- Search uses a **driver-aware LIKE** (`ILIKE` on Postgres, `LIKE` on MySQL) so
  name/employee search stays case-insensitive.
- All other migrations/queries are already portable (`->after()` is ignored on
  Postgres; no MySQL-only functions are used).

---

## Prerequisites

1. **Enable the Postgres PHP driver** (currently NOT enabled).
   - In Laragon: **Menu → PHP → Extensions → pdo_pgsql** (and `pgsql`). Or edit
     `php.ini` and uncomment:
     ```
     extension=pdo_pgsql
     extension=pgsql
     ```
   - Verify: `php -m` should list `pdo_pgsql`.
2. **A Supabase project** (free tier is fine to start).
3. **Laragon installed** (PHP 8.2+; this project targets 8.3).

---

## Step 1 — Create the Supabase project

1. supabase.com → New project. Pick a region close to you (e.g. Singapore for PH).
2. Set a strong **database password** (save it).
3. After it provisions: **Project Settings → Database → Connection info**. Note:
   - Host: `db.<project-ref>.supabase.co` (direct) — or the **Session pooler**
     host/port for serverless/many connections.
   - Port: `5432` (direct) / `6543` (pooler)
   - Database: `postgres`
   - User: `postgres` (direct) / `postgres.<project-ref>` (pooler)
   - SSL: **required**

## Step 2 — Point Laravel at Supabase

Edit `backend/.env`:

```env
DB_CONNECTION=pgsql
DB_HOST=db.<project-ref>.supabase.co
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=postgres
DB_PASSWORD=<your-supabase-db-password>
DB_SSLMODE=require
```

Ensure `config/database.php` → `connections.pgsql` passes sslmode (Laravel's
default pgsql block already reads `DB_SSLMODE`; if not, add
`'sslmode' => env('DB_SSLMODE', 'prefer')`).

Then:
```bash
php artisan config:clear
php artisan migrate:status   # should connect (empty list = connected, nothing run yet)
```

## Step 3 — Create the schema + base data on Supabase

```bash
php artisan migrate --force        # builds all tables on Postgres
php artisan db:seed --force        # companies, permissions, roles, leave types,
                                   # demo accounts, org structure
```

> `migrate:fresh --seed` also works (drops + rebuilds). All migrations are
> Postgres-compatible now.

## Step 4 — Bring over existing data (optional)

Most current data is **seeded or imported**, so the simplest path is:
- Let the seeders recreate the base data (Step 3), then
- **Re-import employees** from your CSV (Employees → Import).

If you must migrate the *exact* current MySQL data (e.g. the corrected attendance),
use a MySQL→Postgres tool such as **pgloader**, or export per-table CSVs from
phpMyAdmin and import them. (Ask and I can generate a per-table export/import plan.)

## Step 5 — Run the app on Laragon

- Put the project under Laragon (or keep its current path) and use Laragon's PHP 8.3.
- Backend: `php artisan serve` (or a Laragon virtual host).
- Frontend: `npm run dev` (unchanged).
- ~~Laragon's bundled MySQL is **not used** — the DB lives on Supabase.~~ (no longer true; MySQL is the live DB)

## Step 6 — Verify

- Log in, open Employees / Attendance / Payroll.
- Run a name search (confirms `ILIKE` works on Postgres).
- Create a payroll run + compute (exercises decimals/joins on Postgres).

---

## Gotchas / notes

- **`pdo_pgsql` must be enabled** or you'll get "could not find driver".
- **SSL is required** by Supabase — set `DB_SSLMODE=require`.
- **Connection limits:** the free tier has limited direct connections; if you see
  "too many connections," switch `DB_HOST`/`DB_PORT`/`DB_USERNAME` to the
  **session pooler** values.
- **Frontend API URL:** for any non-local deploy, replace the hardcoded
  `localhost:8000` in `frontend/next.config.mjs` with an env-driven backend URL.
- **Booleans/JSON/decimals:** handled by Eloquent casts — no code change needed.

---

## What I need from you to finish it

1. Enable `pdo_pgsql` (Step Prereq 1).
2. Create the Supabase project and share the **connection details** (host, port,
   user) — keep the **password** private; you set it in `.env`.

Then I can: set `DB_CONNECTION=pgsql`, run the migrations/seeders against Supabase,
and verify the app end-to-end on Postgres.
