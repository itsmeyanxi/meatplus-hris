# Deployment & Hosting

How the app is published from the office PC to the internet, what's still HTTP-only, and
how to finish HTTPS. For the day-to-day start/deploy/backup commands, see
[04-operations.md](04-operations.md).

> ## ⚠️ Caddy is not in the path today
>
> Windows **Smart App Control** blocks the unsigned `tools\caddy.exe` ("An Application
> Control policy has blocked this file"), so `start-production.ps1` sets `$useCaddy = $false`
> and **Next.js serves port 80 directly**, proxying the backend paths itself via
> `frontend/next.config.mjs`.
>
> Everything below about **DNS, the static IP, and the router port-forward is still
> accurate** — only the process holding port 80 changed. The Caddy configuration is kept
> because it is what to restore when a **signed** Caddy build is available (or Smart App
> Control is turned off, which requires a Windows reset). Restoring it also means moving the
> frontend back to `:3001`.
>
> **What we lose without it:** round-robin load balancing and `/up` health checks. Four
> workers still start, but only `:8000` (users) and `:8001` (devices) receive traffic, and a
> dead `:8000` takes the UI down until the pool is restarted.

## The setup

The whole stack runs on one always-on office PC and is reachable at
**`http://allcompanyhris.meatplus.ph`**:

```
Internet ─▶ Router (forwards :80 → PC) ─▶ Next.js (:80) ─┬─▶ /api /sanctum /up ─▶ Laravel :8000
                                          public entry   ├─▶ /iclock/*         ─▶ Laravel :8001
                                                         └─▶ everything else   ─▶ the app itself
```

Three moving parts make it public:

1. **A static public IP** — the office line resolves to `202.175.255.85`. The ISP allows
   inbound **80/443** (some ISPs block these; if yours does, see *Cloudflare Tunnel* below).
2. **DNS** — an **A record** for `allcompanyhris.meatplus.ph` → `202.175.255.85` at the DNS
   provider. (If a hosting CNAME existed before, it was replaced by this A record at cutover.)
3. **Router port-forward** — forward **inbound TCP 80** (and 443 once HTTPS is on) to the
   PC's LAN IP. Forward *only* those ports.

Caddy *would* reverse-proxy as below — this is the configuration to restore, not what is
running (see the banner above):

```
# Caddyfile (kept for restoration; NOT active)
http://allcompanyhris.meatplus.ph {
    @backend path /api/* /sanctum/* /up /iclock/*
    reverse_proxy @backend 127.0.0.1:8000 127.0.0.1:8001 127.0.0.1:8002 127.0.0.1:8003 {
        lb_policy round_robin
        health_uri /up
    }
    reverse_proxy 127.0.0.1:3001        # everything else → the web app
}
```

`/iclock/*` is intentionally proxied so **biometric devices in other locations** can push
in; it's protected by the device **serial allowlist**, not by network isolation (see
[05-biometric.md](05-biometric.md)).

## Current state: HTTP only

HTTPS/443 is **not yet enabled** — this is deliberate, not a bug:

- Nothing terminates TLS — the router forwards only port 80, and Next.js serves it plainly.
- `backend/.env.production` has `APP_URL=http://…` and `SESSION_SECURE_COOKIE=false`.

**Consequence:** browser features that require a secure origin are **off** — notably the
GPS/geofenced web check-in and the "Use my location" button on the Branch Geofence page.
Everything else works over HTTP.

## Turning on HTTPS (the remaining step)

HTTPS was designed around Caddy's automatic certificates. With Caddy blocked (see the banner
at the top), there are two routes:

**A — restore Caddy first** (the original plan; needs a *signed* Caddy binary):

1. **Router:** also forward inbound **TCP 443** to the PC.
2. Move the frontend back to `:3001` in `start-production.ps1`, set `$useCaddy = $true`.
3. **Caddyfile:** change the site line from `http://allcompanyhris.meatplus.ph` to just
   `allcompanyhris.meatplus.ph`. Caddy then automatically obtains and renews a **Let's
   Encrypt** certificate (needs 80 + 443 reachable and the DNS A record correct).
4. **Backend env:** set `APP_URL=https://…` and `SESSION_SECURE_COOKIE=true`, then
   `php artisan config:cache`.
5. Restart. Verify `https://allcompanyhris.meatplus.ph` loads with a valid padlock, then the
   geofenced check-in features become available.

**B — Cloudflare Tunnel** (below). It terminates TLS at Cloudflare's edge, so it delivers
HTTPS without any local proxy, any signed binary, or an open port. Given Smart App Control,
this is now the shorter path.

> Whichever route: the biometric terminals must keep a working URL. Several are configured
> with **Enable HTTPS = OFF**; moving the site to HTTPS-only without checking each terminal
> will silently stop their punches — and a terminal that can't push marks its people ABSENT.

> A backup of the single-backend Caddyfile is kept as `Caddyfile.single-backend.bak`, and
> `revert-to-single-backend.ps1` rolls the worker pool back to one worker if needed.

## If the ISP blocks 80/443 — Cloudflare Tunnel

If inbound 80/443 can't be opened (CGNAT or ISP block), skip router forwarding entirely and
run a **Cloudflare Tunnel**: install `cloudflared` on the PC, point the tunnel at
`localhost:80` (Next.js, the current entry point), and Cloudflare serves the domain with
HTTPS. No public IP, port forwarding, or signed proxy binary required — which also makes
this the shortest route to HTTPS today.

## Hardening checklist

- `APP_DEBUG=false` in production (no stack traces to users).
- `SESSION_SECURE_COOKIE=true` **once HTTPS is on** (leave `false` while HTTP).
- Trust the proxy so Laravel sees the real client scheme/IP behind the front server
  (`TrustProxies` is set to `*` in `bootstrap/app.php` for this single-host setup).
- Bind PostgreSQL to localhost only (`:5433` is not forwarded on the router — keep it that
  way; the DB must never be internet-reachable).
- Keep the biometric **serial allowlist** enforced (devices inactive by default).
- Secrets live in `.env`, never in git. `*.bak` and `/logs` are gitignored.

## Resilience

- **Power:** the PC and router should be on a **UPS** — a power blip drops the whole
  service and can corrupt an unclean Postgres shutdown. Registering Postgres as a service
  (`register-postgres-service.ps1`) helps it recover after a reboot.
- **Backups:** already scheduled — a local `pg_dump` nightly at 22:00 and an off-site
  Supabase copy at 22:30, both as Windows tasks. Confirm they're green occasionally
  (`Get-ScheduledTaskInfo -TaskName "Meatplus HRIS DB Backup"`), and restore one into a
  scratch database now and then; an untested backup isn't a backup.
- **What you trade away vs. cloud hosting:** uptime depends on the office power/internet;
  certificate renewal and OS updates are your responsibility; there's no automatic off-site
  redundancy. The upside is a sub-millisecond local database and no hosting bill.

## Go-live / cutover discipline

When changing hosting (DNS, ports, HTTPS), do it in a reversible order and verify each step
before the next: prep the PC → open the router port → confirm **port 80 answers on the public
IP** → flip DNS → confirm the domain resolves and loads → **check a biometric terminal still
pushes** (`storage/logs/iclock.log`) → (later) add 443 + HTTPS. Keep the previous config
backed up so any step can be rolled back.
