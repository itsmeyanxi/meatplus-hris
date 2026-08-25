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
  `allcompanyhris.meatplus.ph` (port 80). **Next.js** serves port 80 and forwards `/iclock/*`
  to the Laravel worker on `:8001` — a worker deliberately kept separate from user traffic,
  so a burst of punches can't block the UI. This is safe because of the serial allowlist
  (below).

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

PINs must be **unique per company**, because a device's punches resolve against employees in
**that device's company** first. If two companies could reuse the same PIN numbers, give each
company a **prefix scheme** (e.g. company A = `1xxxx`, company B = `2xxxx`) so a PIN maps to
exactly one person. Within one company, PIN = Employee No. is the simplest convention.

There is a **cross-company fallback** for people re-enrolled on another company's terminal:
if a PIN matches exactly **one** employee across the whole system, the punch is claimed for
them. A PIN matching more than one person is never guessed — it stays staged. That safety
rule has a sharp edge worth knowing: a sandbox or demo employee sharing a PIN with a real one
counts as a collision, and will silently block the real punches from ever being reclaimed.

## Monitoring: is the terminal actually working?

**Biometrics → Connection report** answers this per terminal, and it separates two things
that are easy to confuse:

| Column | Means | Source |
|---|---|---|
| **Last contact** | The unit is powered and reachable | `last_seen_at` — stamped on *any* `/iclock` request |
| **Last punch** | Someone actually scanned | `last_event_at` — only moves when punches arrive |

The terminals poll the server roughly **every 30 seconds, around the clock** (~590 hits per
device per 5 hours, overnight included), which is why a gap in *contact* measured in hours is
a genuine outage. A quiet door with nobody punching is not — it shows as **Connected · no
punches**, and is only worth a look if you expected traffic there.

States: **Live** (in touch within the hour) · **Connected · no punches** (healthy, but no
scans for 7+ days) · **Out of touch** (under 2h) · **Offline** (past that — an alert has
fired) · **Never seen**.

The **match rate** column is the other half of "is it working": the share of what a terminal
sent in 30 days that actually landed on an employee. A reachable terminal with a low match
rate is throwing attendance away because its PINs aren't mapped in the HRIS.

Nobody has to watch this page — a **daily digest** at 07:00 reports offline terminals, ID
collisions and unmapped punches to IT and HR. See
[09-alerts-and-notifications.md](09-alerts-and-notifications.md).

## Punches that don't match anyone

A PIN that maps to no employee is **not dropped**. It's staged in `unmatched_punches`, and
`attendance:reclaim-unmatched` (every 15 minutes) converts staged rows into real punches the
moment that PIN maps to somebody — then recomputes the affected DTRs. So attendance captured
before the person existed in the HRIS is recoverable.

To recover a backlog: set the employee's **Biometric ID** to the PIN the device uses, and
wait for the reclaimer (or run it by hand). The connection report's **Staged** column shows
how much is waiting per terminal, and how many distinct PINs it represents.

## PIN reuse collisions (someone else's punches on your record)

The nastiest failure this system has. Because a PIN falls back to matching **Employee No.**,
this sequence quietly corrupts two people's attendance:

1. An employee is re-enrolled under a new PIN, and their `biometric_user_id` is updated.
2. Their **old employee number** is later reused on the device for a **different** person.
3. That person's punches now land on the original employee's record, via the fallback.

`BiometricAnomalyDetector` (hourly) catches it by comparing the name the *device* has enrolled
under a PIN against the employee it resolves to. Open cases appear under **Attendance →
Biometric issues** and in the daily digest.

The tell in the raw data is one person "arriving" twice each morning on two terminals:

```
04:39 in   QWC5235200338
05:55 in   TTQ5250700211     ← two different people, one PIN
```

**The fix is always the same:** set the correct `biometric_user_id` on each employee, and
re-enrol the second person under their own PIN. Then resolve the issue on the review page.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Nothing in `iclock.log` | Device can't reach the server | Correct address + port? Firewall (TCP 8000 on LAN)? For the public domain, is Next.js up on port 80? |
| Report says **Offline** but the device looks fine | It genuinely hasn't checked in for 2h+ | Power, network cable, and the Cloud Server setting on the terminal. Everyone who punches there is being marked ABSENT meanwhile. |
| Report says **Connected · no punches** | Nothing is wrong with the terminal | Nobody has scanned there in 7+ days. Confirm the door/shift is still in use. |
| Punches accepted but **match rate is low** | The PINs on that terminal aren't mapped | Set each person's **Biometric ID** to their device PIN; the reclaimer then recovers the staged backlog. |
| Someone's DTR shows punches they didn't make | PIN reuse collision | See the section above — fix `biometric_user_id` on both people. |
| Terminal shows **`Unsupported SSL request`** | Device is trying HTTPS | Comm. → Cloud Server: **Enable HTTPS = OFF**, **Enable Domain Name = OFF**; also check System → Security for a global SSL toggle. Save + reboot. |
| Log shows the push, but no punch appears | Device serial not activated | Biometrics → activate the serial + set its company. Also check the log for "rejected punches from unapproved device serial". |
| Push accepted, but no employee matched | PIN doesn't match any employee | Set the employee's **Biometric ID** to the device PIN. |
| Punches show the wrong time | Device clock/timezone off | Fix the device's date/time (the server stores punches in the device's timezone). |
| All punches read as "IN" | Device isn't tagging in/out | Set the attendance status per scan on the device; otherwise the server infers by alternation. |

> **First test tip:** after one scan, look at `iclock.log` — different ZKTeco firmwares
> format the push slightly differently, and that log shows exactly what *your* device sends,
> so the parser in `AdmsIngestionService` can be tuned to match if needed.
