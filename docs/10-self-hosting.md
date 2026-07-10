# Self-hosting on the office PC

> **Status: PLAN, not yet done.** Nothing in this document has been applied. The app
> currently runs on Render + Supabase ([09-local-database.md](09-local-database.md)).
>
> **Goal:** serve `https://allcompanyhris.meatplus.ph` from the office PC, with the
> database on that same PC. No Render, no Supabase.

---

## 1. Target architecture

```
staff (anywhere) ──► allcompanyhris.meatplus.ph
                       A record → 202.175.255.85   (office WAN IP)
                            │
                     router: forward :80 and :443 → 192.168.125.5
                            │
                     Apache (Laragon), TLS terminates here
                            ├─► /api, /sanctum, /up  → Laravel  :8000
                            ├─► /iclock/*            → Laravel  :8000  (LAN only, see §6)
                            └─► everything else      → Next.js  :3001
                                                          │
                                                    MySQL :3306 (this PC)

ZKTeco MB460 ──LAN──► http://192.168.125.5:8000/iclock/cdata
```

One machine runs everything. If it is off, the site is down — see §7.

---

## 2. Prerequisites to confirm **before** starting

Answer these first. Two of them can make the whole plan impossible.

| # | Question | Why it matters |
|---|---|---|
| 1 | Is the WAN IP **static**? | `202.175.255.85` must not change. If the ISP rotates it, the domain silently points nowhere. Ask the ISP; a static IP is usually a paid add-on. |
| 2 | Does the ISP **block inbound 80/443**? | Many PH business/residential plans do, precisely to prevent self-hosting. If blocked, this plan cannot work without a tunnel. |
| 3 | Will the PC be **always on**? | No sleep, no unattended reboots. Windows Update restarts will take payroll offline. |
| 4 | Who owns the **router**? | You need admin access for port forwarding and a DHCP reservation. |

If (1) is dynamic, add a dynamic-DNS updater — GoDaddy's API is workable but not pleasant.
If (2) is blocked, stop here and stay on Render.

---

## 3. Security work that must happen first

The app is currently configured for a trusted LAN. Do **not** open the router until
these are done.

### 3.1 MySQL

`root@localhost` has an **empty password**. There is no remote root account, so this is
not immediately exploitable from the internet — but it is one misconfiguration away.

- Set a strong password for `root`.
- Create a dedicated `meatplus_app` user with rights only on `meatplus_hris`, and use it
  in `.env` instead of `root`.
- Add `bind-address=127.0.0.1` to `C:\laragon\bin\mysql\mysql-8.4.3-winx64\my.ini` so
  MySQL stops listening on `0.0.0.0:3306`. Nothing outside this PC needs it.

### 3.2 The `/iclock/*` routes take no authentication

By design — the ZKTeco device cannot authenticate. `routes/iclock.php` registers them
with **no middleware at all**:

```
/iclock/cdata        GET|POST   receives punches
/iclock/getrequest   GET
/iclock/devicecmd    GET|POST
/iclock/{any}        GET|POST   catch-all
```

Exposed to the internet, anyone can POST fabricated attendance. **Restrict `/iclock/*` to
the LAN at the proxy** (§5) — the device is on the LAN, so nothing is lost.

### 3.3 Laravel

- `APP_DEBUG=false` and `APP_ENV=production`. With debug on, any error prints the
  database password to the visitor.
- `SESSION_SECURE_COOKIE=true` once HTTPS works.
- Keep `trustProxies(at: '*')` in `bootstrap/app.php` — Apache terminates TLS, so without
  it Laravel sees plain HTTP and refuses to set secure cookies.

---

## 4. DNS — undo the Render change

At **GoDaddy → meatplus.ph → DNS**:

1. **Delete** the `CNAME` record: `allcompanyhris` → `meatplus-hris.onrender.com`.
2. **Add** an `A` record: `allcompanyhris` → `202.175.255.85`, TTL 600.

A name cannot hold both a CNAME and an A record, so the CNAME must go first.
Do not touch the **MX** records — they carry company email.

Propagation takes up to the old TTL (1 hour). Verify with:

```
nslookup allcompanyhris.meatplus.ph 8.8.8.8
```

---

## 5. Router and reverse proxy

### 5.1 Router

- **DHCP reservation** for this PC at `192.168.125.5`. It is currently on DHCP and its
  address has already changed twice (`192.168.110.98` → `192.168.125.5`). Without a
  reservation the port forward will point at nothing.
- **Forward TCP 80 → 192.168.125.5:80** — required for the Let's Encrypt HTTP-01 challenge.
- **Forward TCP 443 → 192.168.125.5:443**.

### 5.2 Apache

Laragon's Apache already has the modules needed — `mod_proxy`, `mod_proxy_http`,
`mod_proxy_wstunnel`, `mod_ssl`, `mod_rewrite`. No rebuild.

A vhost in `C:\laragon\etc\apache2\sites-enabled\` must:

- Listen on `:443` with the certificate from §5.3, and redirect `:80` → `:443`.
- Proxy `/api`, `/sanctum`, `/up` → `http://127.0.0.1:8000`.
- Proxy `/iclock/` → `http://127.0.0.1:8000`, **with `Require ip 192.168.125.0/24`** so
  only the LAN can post attendance.
- Proxy everything else → `http://127.0.0.1:3001`.
- Set `X-Forwarded-Proto https` so Laravel knows the original scheme.

If the frontend runs `npm run dev`, also proxy the `/_next/webpack-hmr` websocket via
`mod_proxy_wstunnel`. Better: run `npm run build && npm run start` — a production build
needs no websocket and loads far faster.

### 5.3 Certificate

Install **win-acme** (`wacs.exe`); neither it nor certbot is present today. It obtains a
Let's Encrypt certificate over HTTP-01 and registers a **renewal scheduled task**.

Certificates expire every **90 days**. If renewal fails silently, the site goes down with
a browser security warning. Check the renewal task after the first automatic run.

---

## 6. Application configuration

`backend/.env`:

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://allcompanyhris.meatplus.ph
FRONTEND_URL=https://allcompanyhris.meatplus.ph
SANCTUM_STATEFUL_DOMAINS=allcompanyhris.meatplus.ph
SESSION_SECURE_COOKIE=true

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=meatplus_hris
DB_USERNAME=meatplus_app        # not root
DB_PASSWORD=<strong password>
```

`SANCTUM_STATEFUL_DOMAINS` is a **bare hostname** — no scheme, no port, no trailing slash.
Getting this wrong is the single most common failure in this project: the login page
renders, the password is right, and signing in fails with a 500
(`Session store not set on request`). It has bitten us on port 3000, on a stale LAN IP,
on the Render URL, and on the custom domain.

The frontend needs no change: `next.config.mjs` rewrites `/api` to `BACKEND_URL`, which
defaults to `http://localhost:8000`.

The MySQL data is already on this PC and current as of 2026-07-10 — see
[09-local-database.md](09-local-database.md). Before switching, re-copy anything written
to Supabase since then.

---

## 7. What you are trading away

**Uptime.** Today the site survives this PC sleeping, rebooting, or losing power. Self-hosted,
it does not. Attendance stops, payslips are unreachable, staff at home see nothing.

**Off-site copy.** All payroll and attendance would live on one consumer disk in an office.
`backup-db.ps1` writes to that same disk. Keep the Supabase project as a frozen off-site
snapshot even after the switch — it costs nothing and nothing writes to it.

**Certificate maintenance.** A 90-day clock, forever.

**Security ownership.** An HR system with real salaries, exposed on your router, patched by you.

**What you gain:** the data sits on hardware you control, the ZKTeco device talks to the
backend directly, and there is no free-tier spin-down.

---

## 8. Rollback

Everything here is reversible in about ten minutes:

1. GoDaddy: delete the `A` record, restore the `CNAME` → `meatplus-hris.onrender.com`.
2. Re-create the Render services from `render.yaml` (Blueprint), or un-suspend them.
3. `backend/.env`: uncomment the Supabase block.

Keep the Render services **suspended rather than deleted** until self-hosting has survived
a week, including at least one Windows Update reboot.

---

## 9. Order of work

1. Answer the four questions in §2. If the ISP blocks 80/443 or the IP is dynamic, stop.
2. Security hardening (§3) — MySQL password, bind to loopback, `APP_DEBUG=false`.
3. DHCP reservation, then port forwards (§5.1).
4. Apache vhost, HTTP only, proving the proxy works over plain `:80` (§5.2).
5. Certificate via win-acme, then force HTTPS (§5.3).
6. `.env` switch to MySQL + the domain (§6).
7. Verify: login, employees list, a payslip, and a real punch from the ZKTeco device.
8. Leave Render suspended for a week. Then delete.

---

## Related

- [09-local-database.md](09-local-database.md) — the databases and `backup-db.ps1`
- [06-biometric-zkteco.md](06-biometric-zkteco.md) — device setup
- [07-deployment-performance.md](07-deployment-performance.md) — production build, OPcache
