# Operations

The day-to-day runbook: start the app, deploy a change, back up the database, and the
handful of things that go wrong. For *how the hosting is wired* (Caddy, DNS, router,
HTTPS), see [06-deployment-hosting.md](06-deployment-hosting.md).

## The stack in one picture

```
Caddy (:80)  ─┬─▶  Next.js (:3001)            ← the compiled web app
              └─▶  Laravel pool (:8000–8003)  ← /api, /sanctum, /up, /iclock
                         │
                         ▼
             PostgreSQL 17 (Laragon, :5433, db meatplus_hris)
```

Four Laravel workers run as `php artisan serve` behind Caddy. Because each `artisan serve`
request boots the framework fresh, **backend PHP changes go live on the next request** — no
restart needed. The **frontend** serves a compiled build, so it **must be rebuilt and
restarted** to pick up changes.

## Start everything

```powershell
.\start-production.ps1
```

This one script:
1. Starts **Laragon PostgreSQL 17** on `:5433` if it isn't already up (it isn't a Windows
   service, so a reboot/power cut leaves it down).
2. Activates the production env (`backend/.env.production` → `backend/.env`) and caches
   config + routes.
3. Launches the **4 backend workers** (`:8000`–`:8003`, `--host=0.0.0.0` so LAN devices can
   reach them).
4. Starts the **Next.js** production server on `:3001`.
5. Starts **Caddy** (from `tools\caddy.exe`) on port 80.

To run it automatically at logon: `.\register-autostart.ps1` once.

> **Postgres as a service:** to make the DB survive reboots on its own, register it with
> `.\register-postgres-service.ps1` (one-time).

## Deploy a change

**Backend (PHP):** just save the file — it's live on the next request. If you changed
`.env`, routes, or permissions, refresh the caches:

```powershell
cd backend
php artisan config:cache
php artisan route:cache
php artisan permission:cache-reset   # after any role/permission change
```

**Frontend (Next.js):** rebuild and restart the frontend process:

```powershell
cd frontend
npm run build
# then stop the running "next start" node process and start it again:
npm run start -- -p 3001 -H 0.0.0.0
```

> Tip: after a redeploy, users on an old build may hit a stale-chunk error on navigation.
> The app auto-reloads once to fetch the new build, so a normal refresh clears it.

**Version control:** commit and push to the `HRIS-STAGING` branch so the work isn't only
local.

## Back up the database

```powershell
.\backup-db.ps1                 # writes a timestamped dump to .\backups\ (gitignored)
.\backup-db.ps1 -KeepDays 14    # also prune dumps older than 14 days
```

Restore a dump:

```powershell
# PostgreSQL
& "C:\laragon\bin\postgresql\pgsql\bin\psql.exe" -p 5433 -U postgres -d meatplus_hris -f .\backups\<dump>.sql
```

Always confirm a backup by restoring it into a scratch database occasionally — an untested
backup isn't a backup.

## Common tasks & fixes

| Situation | What to do |
|---|---|
| **DB is down** (after a reboot/outage) | Re-run `.\start-production.ps1`, or start Postgres manually (below). |
| Start Postgres by hand | `& "C:\laragon\bin\postgresql\pgsql\bin\pg_ctl.exe" start -D "C:\laragon\data\postgresql-17" -o "-p 5433"` |
| Roles/permissions changed but not taking effect | `php artisan permission:cache-reset` |
| Frontend changes not showing | You didn't rebuild — `npm run build` then restart `next start`. |
| A backend worker died | Caddy's `/up` health check routes around it; restart the pool with `start-production.ps1` when convenient. |
| Login fails with a CSRF/419 error | Usually a stale browser cache from an old HTTPS visit — hard-refresh (Ctrl+Shift+R) or clear site data. |
| Bulk-load employees / leave / overtime / time logs | Use the in-app **Import** buttons (Employees, Leaves, Overtimes) and **Attendance → Uploads**; all are deduped. |

## One-time local setup (fresh machine)

1. Install **Laragon** (bundles PHP 8.3, Node, PostgreSQL). In Laragon's PHP, enable the
   `pdo_pgsql`, `pgsql`, and `zip` extensions.
2. `cd backend && composer install`; `cd frontend && npm ci`.
3. Create `backend/.env.production` pointing at the local DB
   (`DB_CONNECTION=pgsql`, `DB_HOST=127.0.0.1`, `DB_PORT=5433`, `DB_DATABASE=meatplus_hris`).
4. Run migrations on an empty DB: `php artisan migrate` then `php artisan db:seed`.
   > **Never `db:seed` or `migrate:fresh` a database that already has real data** — it can
   > wipe or duplicate records. Use `php artisan migrate:status` to see what's pending.
5. Build the frontend once (`npm run build`), then `.\start-production.ps1`.

> **Gotcha:** the frontend runs on **`:3001`**, and `SANCTUM_STATEFUL_DOMAINS` /
> `SESSION_DOMAIN` in `.env` must match the host you actually browse (localhost for local,
> `allcompanyhris.meatplus.ph` in production) or logins silently fail.
