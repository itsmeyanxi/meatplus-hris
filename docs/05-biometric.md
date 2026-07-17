# Biometric (ZKTeco / ADMS)

> **Hardware in use:** ZKTeco terminals (e.g. **MB460**, fingerprint + face). These steps
> apply to most ADMS-capable ZKTeco devices; menu labels vary a little by firmware.

The device **pushes** attendance to the server on its own (the ADMS / "iclock" protocol).
The server already has the receiver built (`routes/iclock.php` → `IclockController` →
`AdmsIngestionService`). You point the device at the server, activate it once, and enroll
people.

## How it works

- The device is configured with the **server address** (an IP + port, or the public
  domain) and its **serial number** identifies it.
- Every scan, the device **POSTs the punch to the server**.
- The server checks the device's serial is **activated**, maps the scan's **PIN** to an
  employee, saves the punch, and recomputes that day's attendance.

Nothing reaches *into* the device — it reaches out. So a device works from any branch, on
any network, as long as it can reach the server address.

## Where to point the device

- **Same LAN as the server:** use the PC's local IP + port `8000`
  (e.g. `192.168.1.23:8000`). Find the IP with `ipconfig` (IPv4 Address). Allow TCP **8000**
  through Windows Firewall (Inbound Rule), or allow `php.exe` when Windows prompts.
- **A different location / over the internet:** point it at the public server —
  `allcompanyhris.meatplus.ph` (port 80). Caddy forwards `/iclock/*` to the backend. This
  is safe because of the serial allowlist (below).

## Step-by-step

1. **Server running** — `.\start-production.ps1` is up (workers listen on `0.0.0.0`).
2. **Configure the device:** Menu → **Comm. → Cloud Server Setting** (a.k.a. ADMS / Cloud
   Server):
   - **Server Mode / Protocol:** ADMS (or "HTTP")
   - **Server Address:** the LAN IP *or* `allcompanyhris.meatplus.ph`
   - **Server Port:** `8000` (LAN) or `80` (public domain)
   - **Enable HTTPS:** OFF · **Enable Domain Name:** OFF (unless using the domain) ·
     **Enable Proxy:** OFF
   - Save and let it reboot.
3. **Activate the device:** it auto-registers by serial on first contact but arrives
   **inactive**, and its punches are rejected until you approve it. In the app →
   **Biometrics** → find the new serial → set its **company** and **activate** it.
4. **Match people (PIN ↔ employee):** the device knows each person by a **PIN**. The server
   maps that PIN to the employee's **Biometric ID** (fallback: **Employee No.**). So when
   you enroll someone, use a PIN that equals their Employee No., *or* set their Biometric ID
   (Employees → person → Edit) to the PIN you used.
5. **Test:** scan once, then check `backend/storage/logs/iclock.log` for the push, and
   **Attendance → Time Logs** for the mapped punch (filter by the device to isolate it).

## Security — the serial allowlist

Exposing `/iclock` to the internet is safe because **only activated device serials are
accepted**. An unknown terminal that pushes gets registered as *inactive* and its data is
**rejected** (and logged) until an admin activates it and assigns a company. So a forged
push from a random device can't inject punches.

## Multi-tenant PINs

PINs must be **unique per company** in the system, because a device's punches resolve
against employees in **that device's company**. If two companies could reuse the same PIN
numbers, give each company a **prefix scheme** (e.g. company A = `1xxxx`, company B =
`2xxxx`) so a PIN maps to exactly one person. Within one company, PIN = Employee No. is the
simplest convention.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Nothing in `iclock.log` | Device can't reach the server | Correct address + port? Firewall (TCP 8000 on LAN)? For the public domain, is Caddy up on port 80? |
| Terminal shows **`Unsupported SSL request`** | Device is trying HTTPS | Comm. → Cloud Server: **Enable HTTPS = OFF**, **Enable Domain Name = OFF**; also check System → Security for a global SSL toggle. Save + reboot. |
| Log shows the push, but no punch appears | Device serial not activated | Biometrics → activate the serial + set its company. Also check the log for "rejected punches from unapproved device serial". |
| Push accepted, but no employee matched | PIN doesn't match any employee | Set the employee's **Biometric ID** to the device PIN. |
| Punches show the wrong time | Device clock/timezone off | Fix the device's date/time (the server stores punches in the device's timezone). |
| All punches read as "IN" | Device isn't tagging in/out | Set the attendance status per scan on the device; otherwise the server infers by alternation. |

> **First test tip:** after one scan, look at `iclock.log` — different ZKTeco firmwares
> format the push slightly differently, and that log shows exactly what *your* device sends,
> so the parser in `AdmsIngestionService` can be tuned to match if needed.
