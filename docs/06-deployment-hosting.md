# Deployment & Hosting

How the app is published from the office PC to the internet, what's still HTTP-only, and
how to finish HTTPS. For the day-to-day start/deploy/backup commands, see
[04-operations.md](04-operations.md).

## The setup

The whole stack runs on one always-on office PC and is reachable at
**`http://allcompanyhris.meatplus.ph`**:

```
Internet ─▶ Router (forwards :80 → PC) ─▶ Caddy (:80) ─┬─▶ Next.js (:3001)
                                                        └─▶ Laravel pool (:8000–8003)
```

Three moving parts make it public:

1. **A static public IP** — the office line resolves to `202.175.255.85`. The ISP allows
   inbound **80/443** (some ISPs block these; if yours does, see *Cloudflare Tunnel* below).
2. **DNS** — an **A record** for `allcompanyhris.meatplus.ph` → `202.175.255.85` at the DNS
   provider. (If a hosting CNAME existed before, it was replaced by this A record at cutover.)
3. **Router port-forward** — forward **inbound TCP 80** (and 443 once HTTPS is on) to the
   PC's LAN IP. Forward *only* those ports.

Caddy then reverse-proxies:

```
# Caddyfile (current, HTTP-first)
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

- The Caddyfile is pinned to `http://…` and the router forwards only port 80.
- `backend/.env.production` has `APP_URL=http://…` and `SESSION_SECURE_COOKIE=false`.

**Consequence:** browser features that require a secure origin are **off** — notably the
GPS/geofenced web check-in and the "Use my location" button on the Branch Geofence page.
Everything else works over HTTP.

## Turning on HTTPS (the remaining step)

1. **Router:** also forward inbound **TCP 443** to the PC.
2. **Caddyfile:** change the site line from `http://allcompanyhris.meatplus.ph` to just
   `allcompanyhris.meatplus.ph`. Caddy then automatically obtains and renews a **Let's
   Encrypt** certificate (needs 80 + 443 reachable and the DNS A record correct).
3. **Backend env:** set `APP_URL=https://…` and `SESSION_SECURE_COOKIE=true`, then
   `php artisan config:cache`.
4. Restart Caddy. Verify `https://allcompanyhris.meatplus.ph` loads with a valid padlock,
   then the geofenced check-in features become available.

> A backup of the single-backend Caddyfile is kept as `Caddyfile.single-backend.bak`, and
> `revert-to-single-backend.ps1` rolls the worker pool back to one worker if needed.

## If the ISP blocks 80/443 — Cloudflare Tunnel

If inbound 80/443 can't be opened (CGNAT or ISP block), skip router forwarding entirely and
run a **Cloudflare Tunnel**: install `cloudflared` on the PC, point the tunnel at
`localhost:80` (Caddy), and Cloudflare serves the domain with HTTPS. No public IP or port
forwarding required.

## Hardening checklist

- `APP_DEBUG=false` in production (no stack traces to users).
- `SESSION_SECURE_COOKIE=true` **once HTTPS is on** (leave `false` while HTTP).
- Trust the proxy so Laravel sees the real client scheme/IP behind Caddy
  (`TrustProxies` set to the proxy, or `*` for a single-host setup).
- Bind PostgreSQL to localhost only (`:5433` is not forwarded on the router — keep it that
  way; the DB must never be internet-reachable).
- Keep the biometric **serial allowlist** enforced (devices inactive by default).
- Secrets live in `.env`, never in git. `*.bak` and `/logs` are gitignored.

## Resilience

- **Power:** the PC and router should be on a **UPS** — a power blip drops the whole
  service and can corrupt an unclean Postgres shutdown. Registering Postgres as a service
  (`register-postgres-service.ps1`) helps it recover after a reboot.
- **Backups:** run `backup-db.ps1` on a schedule and keep at least one **off-site** copy —
  self-hosting means there's no managed provider doing this for you.
- **What you trade away vs. cloud hosting:** uptime depends on the office power/internet;
  certificate renewal and OS updates are your responsibility; there's no automatic off-site
  redundancy. The upside is a sub-millisecond local database and no hosting bill.

## Go-live / cutover discipline

When changing hosting (DNS, ports, HTTPS), do it in a reversible order and verify each step
before the next: prep the PC → open the router port → confirm Caddy answers on the public IP
→ flip DNS → confirm the domain resolves and loads → (later) add 443 + HTTPS. Keep the
previous config backed up so any step can be rolled back.
