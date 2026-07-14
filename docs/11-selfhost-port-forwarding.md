# Self-hosting on the office PC (port forwarding, no Render)

Goal: users type `allcompanyhris.meatplus.ph` and reach the app running on the
office PC directly — no Render, no monthly cost, no cold-start sleep.

## Known facts (as of 2026-07-14)
- **Public IP:** `202.175.255.85` — reverse DNS `...static.eastern-tele.com`
  (Eastern Telecoms). Looks **static** → port forwarding is viable.
- **Office PC LAN IP:** `192.168.125.5` (give it a permanent reservation — see 1.1).
- **App ports on the PC:** frontend `3001`, backend `8000`.
- **Domain today:** `allcompanyhris.meatplus.ph` is a **CNAME → Render**. DNS for
  `meatplus.ph` is managed at **GoDaddy**.
- **Safe by design:** the frontend only proxies `/api`, `/sanctum`, `/up`. The
  unauthenticated ZKTeco `/iclock` routes are NOT proxied, so pointing the public
  entry point at the frontend keeps `/iclock` LAN-only. The device keeps pushing
  to `192.168.125.5:8000/iclock` on the LAN.

---

## Status — PC-side prep done (2026-07-14)
Decisions: **DB = local Laragon Postgres** · **Exposure = port forwarding**.
Already prepared on the PC (safe, reversible; live Render site untouched):
- [x] Local Postgres `meatplus_hris` on `:5433` — exact mirror of Supabase (71 tables).
- [x] Strong password set on the `postgres` role (stored in `.env.production`).
- [x] `backend/.env.production` created — `APP_ENV=production`, `APP_DEBUG=false`,
      `APP_URL=https://…`, Sanctum domain, `SESSION_SECURE_COOKIE=true`, DB → local `:5433`.
      Same `APP_KEY` preserved (encrypted fields stay readable). Verified: Laravel
      connects to the local DB and all migrations show **Ran**.
- [x] `frontend/.env.local` → `BACKEND_URL=http://127.0.0.1:8000`.
- [x] `Caddyfile` (repo root) — auto-HTTPS reverse proxy → 3001, security headers.
- [x] `start-production.ps1` — activates prod env, caches config, runs compiled
      frontend (`next start`) + backend + Caddy.
- [x] Production frontend build (`npm run build`).

**Remaining — human-only steps (see phases below):** confirm ISP allows inbound
80/443 (Phase 0), stop Laragon Apache + install Caddy as a service (Phase 2),
router port-forward 80/443 (Phase 3), GoDaddy DNS A-record cut-over (Phase 4),
harden local Postgres `pg_hba.conf` trust→scram (Phase 6).

---

## Phase 0 — Feasibility checks (do these FIRST, before touching anything)
- [ ] **Confirm the IP is static** with Eastern Telecoms (ask: "is 202.175.255.85
      a fixed/static IP on our account?"). If it can change, you'll also need
      Dynamic DNS (DDNS) — or use the Cloudflare Tunnel fallback below.
- [ ] **Confirm the ISP allows inbound ports 80 and 443.** Some business plans
      block them. Ask the ISP, or test after Phase 2. This is the make-or-break item.
- [ ] Confirm you have **admin login to the office router**.
- [ ] Confirm you can **edit DNS records for `meatplus.ph` at GoDaddy**.
- [ ] Decide the office PC stays **on 24/7**. Add a **UPS** so a brief power blip
      doesn't take the whole company's HRIS offline.

If the ISP blocks 80/443, or the IP turns out dynamic/CGNAT → skip port forwarding
and use **Cloudflare Tunnel** (see the last section). Everything else stays the same.

---

## Phase 1 — Prepare the PC as a real server
- [ ] **1.1 Fixed LAN IP:** set a DHCP reservation on the router so the PC is always
      `192.168.125.5` (or set a static IP on the PC). Port forwarding breaks if it moves.
- [ ] **1.2 Production build of the frontend** (not `npm run dev`):
      `cd frontend && npm ci && npm run build`, then run `npm run start -- -p 3001 -H 0.0.0.0`.
- [ ] **1.3 Backend in production mode:** run via the existing start script, but with
      the production env from Phase 5.
- [ ] **1.4 Auto-start on boot:** update the existing "Meatplus HRIS Autostart"
      scheduled task to launch the **production** frontend + backend (and Caddy from
      Phase 2), so a reboot brings everything back automatically.
- [ ] **1.5 Pick the database** (see "Database choice" below): keep Supabase, or
      switch to the now-synced Laragon Postgres for a fully offline setup.

---

## Phase 2 — HTTPS + reverse proxy on the PC (Caddy — recommended)
Caddy gives automatic free HTTPS (Let's Encrypt) and is one small config file.
- [ ] **2.1 Install Caddy** for Windows.
- [ ] **2.2 Caddyfile:**
      ```
      allcompanyhris.meatplus.ph {
          encode gzip
          reverse_proxy 127.0.0.1:3001
      }
      ```
      Caddy listens on 80/443, terminates TLS, and forwards to the frontend, which
      in turn proxies `/api` etc. to the backend on 8000. `/iclock` is never routed
      here, so it stays off the internet.
- [ ] **2.3 Windows Firewall:** allow inbound TCP **80** and **443**. (Let's Encrypt
      needs 80 reachable for the certificate challenge.)
- [ ] **2.4 Run Caddy as a service** so it survives reboots.

(Alternative to Caddy: Nginx or IIS with a Let's Encrypt cert via win-acme. Caddy is
the least work.)

---

## Phase 3 — Router port forwarding
- [ ] Forward external **TCP 80 → 192.168.125.5:80**
- [ ] Forward external **TCP 443 → 192.168.125.5:443**
- [ ] Forward **nothing else.** Do NOT forward 8000, 3001, 3306, 5432/5433, or 22.

---

## Phase 4 — DNS cut-over (at GoDaddy)
- [ ] Change the `allcompanyhris` record from **CNAME → onrender** to an **A record →
      `202.175.255.85`**.
- [ ] Keep TTL low (e.g. 600s) during the switch so you can roll back fast.
- [ ] Wait for propagation (current TTL is 3600s = up to 1 hour).

---

## Phase 5 — App configuration for the domain
`backend/.env`:
- [ ] `APP_ENV=production`
- [ ] `APP_DEBUG=false`  ← **critical**: `true` leaks env vars (incl. DB password) on errors
- [ ] `APP_URL=https://allcompanyhris.meatplus.ph`
- [ ] `SANCTUM_STATEFUL_DOMAINS=allcompanyhris.meatplus.ph`  (bare host, no scheme)
- [ ] `SESSION_SECURE_COOKIE=true`
- [ ] Keep `trustProxies(at: '*')` (already in `bootstrap/app.php`) so Caddy's
      forwarded HTTPS is trusted.
- [ ] `php artisan config:cache && php artisan route:cache`

`frontend`:
- [ ] `BACKEND_URL=http://127.0.0.1:8000` (server-side proxy target), then rebuild.
- [ ] `allowedDevOrigins` already includes the domain (only matters in dev).

---

## Phase 6 — Security hardening (it's now on the public internet)
- [ ] `APP_DEBUG=false` (repeat because it matters most).
- [ ] **Verify `/iclock` is unreachable from outside:** from mobile data, hitting
      `https://allcompanyhris.meatplus.ph/iclock/cdata` must NOT work. The device
      keeps using the LAN IP `192.168.125.5:8000`.
- [ ] **Set a real DB password.** Laragon MySQL `root` currently has an EMPTY
      password. If you use a local DB, give it a strong password and update `.env`.
- [ ] Confirm **login throttling** is active (Laravel route throttle) to slow
      brute-force attempts.
- [ ] Windows Firewall: only 80/443 open from the WAN; keep everything else LAN-only.
- [ ] Keep Windows + PHP + Node patched.
- [ ] **Optional but recommended:** put Cloudflare's proxy (orange cloud) in front —
      set the A record inside Cloudflare with proxy ON. You get DDoS protection,
      hides your real IP, and a WAF, while still port-forwarding underneath.

---

## Phase 7 — Verify, then retire Render
- [ ] From **outside** the office (phone on mobile data): `https://allcompanyhris.meatplus.ph`
      loads, and login works.
- [ ] Certificate is valid (padlock, no warning).
- [ ] ZKTeco device still pushing punches on the LAN.
- [ ] Run for a day alongside Render; once stable, **suspend/delete the Render
      services** and remove the Render-specific env from the deploy.

---

## Database choice
- **Keep Supabase (simplest):** nothing to migrate; the PC's backend keeps reading
  the cloud DB. Downside: needs internet to the DB; you're still dependent on Supabase.
- **Use Laragon Postgres (fully offline):** it's already synced to match Supabase
  (`:5433`, 80 migrations, current data). Point `.env` at it, and everything —
  app + data — lives on the office PC. Downside: back it up (the `backup-db.ps1`
  script) since it's now the only copy. Same `APP_KEY` must be kept so encrypted
  fields stay readable.

---

## Fallback: Cloudflare Tunnel (if port forwarding can't be used)
If the ISP blocks 80/443 or the IP isn't static, skip Phases 2–4 and instead:
- [ ] Move `meatplus.ph` DNS to Cloudflare (replicate ALL existing records first,
      especially **MX/email**, or email breaks).
- [ ] Install `cloudflared` on the PC, create a tunnel, route
      `allcompanyhris.meatplus.ph → http://127.0.0.1:3001`.
- No router changes, no open ports, no static IP needed. Same PC-as-server, TLS
  handled by Cloudflare. This is the safer bet if Phase 0 checks fail.
