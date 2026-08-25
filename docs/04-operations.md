# Operations

The day-to-day runbook: start the app, deploy a change, back up the database, and the
handful of things that go wrong. For *how the hosting is wired* (DNS, router,
HTTPS), see [06-deployment-hosting.md](06-deployment-hosting.md).

## The stack in one picture

```
Next.js (:80)  ─┬─▶  /api  /sanctum  /up  ─▶  Laravel :8000   ← user traffic
 public entry   ├─▶  /iclock/*            ─▶  Laravel :8001   ← biometric devices
                └─▶  everything else      ─▶  the Next app itself
                            │
                            ▼
                PostgreSQL 17 (Laragon, :5433, db meatplus_hris)

  + queue worker   (php artisan queue:work, watchdog-restarted)  ← sends queued mail
  + scheduler      (php artisan schedule:run, every minute)      ← routes/console.php
```

Four Laravel workers start as `php artisan serve`, but only `:8000` and `:8001` receive
traffic — the proxying happens in `frontend/next.config.mjs`, which has no load balancing.
Device pushes are deliberately sent to a different worker than the UI because `artisan serve`
handles one request at a time.

Because each `artisan serve` request boots the framework fresh, **backend PHP changes go live
on the next request** — no restart needed. The **frontend** serves a compiled build, so it
**must be rebuilt and restarted** to pick up changes.

> **Caddy is not running.** Windows Smart App Control blocks the unsigned `tools\caddy.exe`,
> so `start-production.ps1` sets `$useCaddy = $false` and Next.js took over port 80. The
> practical loss is failover: if the `:8000` worker dies, the UI is down until the pool is
> restarted, because nothing health-checks `/up` any more.

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
4. Starts the **queue worker watchdog** (`queue-worker-keepalive.ps1 -Watch`), which keeps
   `queue:work` alive so queued mail always sends.
5. Starts the **Next.js** production server on **port 80** — the public entry point.

To run it automatically at logon: `.\register-autostart.ps1` once.

## What runs on a timer

Two layers, and it matters which is which. **Laravel's scheduler** owns the application jobs
and is driven by one Windows task calling `php artisan schedule:run` every minute; the jobs
themselves are declared in `backend/routes/console.php`. A few **Windows tasks** sit outside
Laravel entirely.

Laravel scheduler (`php artisan schedule:list` shows this live):

| Job | Cadence | What it does |
|---|---|---|
| `attendance:sync-biometric` | every 5 min | Pulls punches from terminals that are polled rather than pushing |
| `attendance:reclaim-unmatched` | every 15 min | Turns staged unmatched punches into real ones once a PIN maps |
| `attendance:detect-biometric-anomalies` | hourly | Finds PIN-reuse collisions (detection only — does not notify) |
| `attendance:biometric-digest` | daily 07:00 | **The** biometric notice: offline terminals, collisions, unmapped punches |
| `employees:detect-data-issues` | hourly | Scans for employee-data gaps (detection only) |
| `employees:detect-data-issues --notify` | daily 07:05 | Sends that digest to HR |

Windows Scheduled Tasks (all prefixed *Meatplus HRIS*):

| Task | Cadence | What it does |
|---|---|---|
| Scheduler | every 1 min | `php artisan schedule:run` — drives the table above |
| Frontend Watchdog | every 1 min | Restarts the Next.js process if port 80 stops answering |
| Attendance Closeout | daily 05:30 | `sync-attendance.ps1` → `attendance:sync-dtr --days=3`, marks no-punch scheduled workdays ABSENT |
| DB Backup | daily 22:00 | Local `pg_dump` into `.\backups\` |
| Supabase Offsite Backup | daily 22:30 | Off-site disaster-recovery copy |
| Data Archive | daily 23:00 | Periodic archive sweep |
| Autostart | at logon | Runs `start-production.ps1` |

> The attendance close-out runs **outside** the Laravel scheduler for historical reasons. It
> works, but it is the odd one out — if you are looking for why absences appeared, look at
> the Windows task, not `routes/console.php`.

Check any of it: `Get-ScheduledTaskInfo -TaskName "Meatplus HRIS Scheduler"` for the Windows
side (`Result` of `0` means success), `php artisan schedule:list` for the Laravel side.

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

**Frontend (Next.js):** use the deploy script — don't build by hand:

```powershell
.\deploy-frontend.ps1
```

It stops the running server, puts a **maintenance page on port 80** for the length of the
build, rebuilds, then restarts Next. Building by hand leaves port 80 dead for a few minutes,
which users see as a browser error rather than "we'll be right back".

> Tip: after a redeploy, users on an old build may hit a stale-chunk error on navigation.
> The app auto-reloads once to fetch the new build, so a normal refresh clears it.

**Database (migrations):** `php artisan migrate --force`. Backend code is already live, but
a migration is not applied until you run it.

**Version control:** commit and push to the `HRIS-STAGING` branch so the work isn't only
local.

## Back up the database

**This already runs nightly** — a local dump at 22:00 and an off-site Supabase copy at 22:30,
both as Windows scheduled tasks. Run one by hand when you want a dump before a risky change:

```powershell
.\backup-db.ps1                 # writes a timestamped dump to .\backups\ (gitignored)
.\backup-db.ps1 -KeepDays 14    # also prune dumps older than 14 days
.\backup-to-supabase.ps1        # off-site disaster-recovery copy
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
| Frontend changes not showing | You didn't rebuild — run `.\deploy-frontend.ps1`. |
| A backend worker died | Nothing routes around it any more (no Caddy). If the site or `/api` is failing, restart the pool with `start-production.ps1`. |
| Scheduled jobs not running | Check the Windows task: `Get-ScheduledTaskInfo -TaskName "Meatplus HRIS Scheduler"`. A `Result` other than 0, or a stale `LastRunTime`, means Laravel's scheduler never fired. |
| Emails not arriving | The queue worker is down — mail is queued, not sent inline. Check for a `queue:work` process; `start-production.ps1` restarts the watchdog. `select count(*) from failed_jobs;` shows failures. |
| A terminal stopped sending punches | See [05-biometric.md](05-biometric.md) — the connection report distinguishes "offline" from "connected but nobody punching". |
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
6. Install the timers: `.\tools\install-scheduler.ps1` and
   `.\tools\install-frontend-watchdog.ps1` (one-time each). Without the first, **nothing
   recurring runs** — no biometric sync, no digests, no absence close-out.

> **Gotcha:** the frontend serves **port 80**, and `SANCTUM_STATEFUL_DOMAINS` /
> `SESSION_DOMAIN` in `.env` must match the host you actually browse (localhost for local,
> `allcompanyhris.meatplus.ph` in production) or logins silently fail.

> **Which env file?** `APP_ENV=production` makes Laravel read **`.env.production`**, not
> `.env`. Edit that one, then `php artisan config:cache`, or your change appears to do
> nothing.
