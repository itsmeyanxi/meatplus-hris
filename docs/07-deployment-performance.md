# Deployment & Performance Checklist

Performance steps to run **at deployment**, not during active development.
Each item notes *why*, the *command*, and the *dev-loop caveat* (why we don't do it
while building).

> **Context (current, 2026-07-10):** the web app is deployed on **Render** (Singapore)
> against **Supabase Postgres** (`ap-southeast-1`). The office PC additionally runs the
> Laravel backend on a Laragon stack, pointed at the same Supabase, so the ZKTeco device can
> push punches to it on the LAN ([09-local-database.md](09-local-database.md)).
>
> Locally, `start-servers.ps1` serves the frontend in **dev mode** (`npm run dev` on `:3001`)
> so code changes hot-reload; its on-demand compiling makes the first visit to each route
> slow. Render serves a production build. The ~145 ms/query round-trip to the cloud DB
> described under "Database latency" below still applies.

---

## 1. Frontend — production build

**Why:** dev mode compiles each route on first visit (the multi-second first hits).
A production build is precompiled, minified, and tree-shaken — dramatically faster.

```bash
cd frontend
npm ci                # clean, lockfile-exact install
npm run build
npm run start -- -p 3001   # serves the optimized build
```

- Use `:3001`. Only `:3001` origins are listed in `SANCTUM_STATEFUL_DOMAINS`, so serving
  on the `npm run start` default of `:3000` makes login fail CSRF validation.
- Set `NEXT_PUBLIC_API_URL` (or keep the proxy rewrites) to the production API origin.
- **Dev caveat:** `build`/`start` has **no hot-reload** — every change needs a rebuild.
  Only for staging/prod, never while building features.

---

## 2. Backend — Laravel optimize

**Why:** caches config, routes, events, and views so they aren't re-parsed per request.

```bash
cd backend
php artisan optimize        # config + route + events cache (+ view:cache)
# or individually:
php artisan config:cache
php artisan route:cache
php artisan event:cache
php artisan view:cache
```

- After **any** `.env`, route, or config change you MUST re-run, or clear:
  ```bash
  php artisan optimize:clear
  ```
- **Dev caveat (important):** `config:cache` **freezes `.env`** — edits are ignored
  until cleared. We change `.env`/permissions constantly in dev, so this is a footgun.
  Do it only on deploy, as part of the release script.
- `route:cache` requires all routes use controllers (no closures) — this app already does.

---

## 3. OPcache — production settings

**Why:** compiles PHP once and serves bytecode from memory. Biggest single backend win.
Currently **not enabled** on the Laragon box — `zend_extension=opcache` is still commented
out in `C:\laragon\bin\php\php-<version>\php.ini`.

Dev currently keeps **timestamp validation ON** so code edits hot-reload. In production,
turn it **OFF** so PHP never stats files (faster), and reload on each deploy.

```ini
zend_extension=opcache
opcache.enable=1
opcache.enable_cli=1
opcache.memory_consumption=192
opcache.interned_strings_buffer=16
opcache.max_accelerated_files=20000

; PRODUCTION ONLY — do NOT set in dev (you'd stop seeing code changes):
opcache.validate_timestamps=0
```

- With `validate_timestamps=0`, **every deploy must reload PHP/opcache**
  (`php artisan optimize` + restart php-fpm / `opcache_reset()`), or old bytecode is served.

---

## 4. Concurrency — get off `php artisan serve`

`artisan serve` is **single-threaded** — parallel API calls queue. Pick one for prod:

### Option A — Web server + PHP-FPM (recommended, standard)
Serve `backend/public` via Nginx/Apache + PHP-FPM (this is what Forge sets up).
- Handles many concurrent requests.
- Re-point the frontend proxy / `NEXT_PUBLIC_API_URL` to the prod API origin.
- Re-verify Sanctum cookie config for the prod domain:
  `APP_URL`, `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN`, `config/cors.php` (`FRONTEND_URL`).

### Option B — Laravel Octane (max throughput, more care)
Boots the app once, keeps it in memory.
- Use **RoadRunner** or **FrankenPHP** in production (Swoole isn't a fit on Windows).
- **State-leak audit required:** anything assuming a fresh boot can bleed across requests.
  - ⚠️ This app sets the **spatie permissions team-id per request** (`SetPermissionsTeam`
    middleware). Under Octane this **must reset each request** or one user's company/
    permission context can leak to another (security risk). Verify before enabling.
- Reload workers on deploy: `php artisan octane:reload`.

---

## 5. Database latency (Supabase)

The DB is **Supabase Postgres in Singapore (`ap-southeast-1`)**; the app currently runs
on a local laptop. Measured round-trip is **~145 ms per query**, so a page that issues
10–25 queries spends **1.5–3.6 s** purely waiting on the network — independent of code or
CPU. To address it:

- **Reduce queries per page** — eager-load relations (the employee list already does),
  cache static lookups. Helps, but the floor is ~1 s/page.
- **Run the database locally** (Postgres on the server box), keep Supabase as backup —
  drops query latency to **<1 ms**; pages become near-instant. Best for an on-site server.
- **Host the app next to the DB** (same datacenter) — app↔DB <1 ms *and* reachable from
  any browser. The production end-state.

> Sessions and cache are already on the **`file`** driver (local disk), so they do **not**
> add remote round-trips — good, leave them.

## 6. Data layer (prod env)

In production, swap the local drivers for Redis + S3.

```env
CACHE_STORE=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis        # or database; redis is faster
FILESYSTEM_DISK=s3          # or DO Spaces
```

- Run a **queue worker** for anything queued (notifications, future payroll jobs):
  `php artisan queue:work --tries=3` (via Supervisor/Forge daemon).
- **Permission cache:** spatie caches permissions; after seeding/role changes run
  `php artisan permission:cache-reset`.
- Add DB indexes as data grows (most hot tables already have composite indexes).

---

## 7. Quick release script (sketch)

```bash
# backend
cd backend
php artisan down
git pull
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan optimize          # config/route/event/view cache
php artisan permission:cache-reset
# reload php-fpm / octane so opcache picks up new code
php artisan up

# frontend
cd ../frontend
npm ci
npm run build
# restart the Next process (pm2/systemd/Forge)
```

---

## What's already done (dev)
- ✅ **OPcache enabled** (dev settings: timestamps validated so edits hot-reload).
- ✅ **React Query** tuned: `staleTime` 60s, `gcTime` 5m, `refetchOnWindowFocus: false`
  (fewer redundant API calls).

## Do NOT do during active development
- ❌ `config:cache` / `php artisan optimize` (freezes `.env`).
- ❌ `opcache.validate_timestamps=0` (you stop seeing code changes).
- ❌ `npm run build` as your dev loop (no hot-reload).
- ❌ Octane on the Windows/Laragon dev box.
