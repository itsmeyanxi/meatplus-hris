# 🟢 Connect the ZKTeco device (ADMS / Push)

> **Hardware in use:** ZKTeco **MB460** (fingerprint + face). These steps apply to most
> ADMS-capable ZKTeco terminals; menu labels vary slightly by firmware.

Your ZKTeco terminal **pushes** attendance to the HRIS by itself (the ADMS / "iclock"
protocol). The server already has the receiver built (`routes/iclock.php` →
`IclockController` → `AdmsIngestionService`). You just point the device at the server
and enroll people.

> **Networking note:** the device and the server PC must be on the **same network** (same
> router — the first three numbers of their IPs must match). A device on `192.168.1.x`
> cannot reach a PC on `192.168.110.x`. Wire both to the same router for a stable setup.

---

## How it works (plain words)

- The device is configured with the **server's address** (your PC's IP + port).
- Every time someone scans, the device **sends that punch to the server** over the network.
- The server matches the device's **PIN** (the number a person is enrolled under) to an
  employee, saves the punch, and recomputes attendance.

So nothing needs to "reach into" the device — it reaches out to you. 👍

---

## Step 1 — Find your PC's network IP

1. Open a terminal and run:
   ```
   ipconfig
   ```
2. Look for **IPv4 Address** under your active adapter (Wi‑Fi or Ethernet).
   It looks like `192.168.1.23`. **Write it down** — that's your **SERVER IP**.

> The device and the PC must be on the **same network** (same Wi‑Fi/router).

## Step 2 — Allow the port through Windows Firewall

The device connects to **port 8000**. Allow it once:
1. Windows Search → **Windows Defender Firewall** → **Advanced settings**.
2. **Inbound Rules → New Rule → Port → TCP → 8000 → Allow** → name it "HRIS".

(Or, simpler for testing: allow `php.exe` through the firewall when Windows prompts you.)

## Step 3 — Make sure the app is running with LAN access

Use the updated **`start-app.bat`** (it now starts the backend with `--host=0.0.0.0`,
which lets the device reach it). Double‑click it, or just reboot if it's in Startup.

## Step 4 — Configure the device

On the ZKTeco terminal:
1. **Menu → Comm. (Communication) → Cloud Server Setting** (sometimes **ADMS** or
   **Cloud Server**).
2. Set:
   - **Server Mode / Protocol:** ADMS (or "HTTP")
   - **Server Address:** your **SERVER IP** from Step 1 (e.g. `192.168.1.23`)
   - **Server Port:** `8000`
   - **Enable Domain Name:** OFF
   - **Enable Proxy:** OFF
3. **Save** and let the device **reboot / reconnect**.

The device will start calling `http://<SERVER IP>:8000/iclock/...` on its own.

## Step 5 — Match people (PIN ↔ employee)

The device knows each person by a **PIN** (a number you set when enrolling them on
the terminal). The HRIS matches that PIN to an employee by:
1. the employee's **Biometric ID** field, or
2. their **Employee No.** if Biometric ID is blank.

So when you enroll someone on the device, **use a PIN that matches** — either their
Employee No., or set their **Biometric ID** (Employees → person → Edit) to the PIN
you used.

## Step 6 — Test it

1. **Scan** on the device once.
2. On the server, open this file:
   ```
   backend/storage/logs/iclock.log
   ```
   You should see the device's request appear (the handshake, then an ATTLOG push
   with the punch). **This proves the device reached the server.**
3. In the app → **Attendance → Time logs** (or the person's attendance) → the punch
   should appear, mapped to the employee.

---

## If something's off

| Symptom | Likely cause | Fix |
|---|---|---|
| Nothing in `iclock.log` | Device can't reach the PC | Same network? Correct SERVER IP + port 8000? Firewall (Step 2)? |
| Backend terminal shows **`Invalid request (Unsupported SSL request)`** | Device is trying HTTPS despite ADMS set to HTTP | Check **Menu → Comm. → Cloud Server**: `Enable HTTPS` = OFF, `Enable Domain Name` = OFF. Also check **Menu → System → Security** for a global SSL toggle. Save and reboot. |
| Log shows the push, but no employee punch | PIN doesn't match | Set the employee's **Biometric ID** to the device PIN (Step 5) |
| Punches show wrong time | Device clock is off | Set the device's date/time (or its timezone) correctly |
| All punches show as "IN" | Device isn't tagging in/out | Set the device's **work/attendance status** per scan, or we infer by alternation |

> 📋 **Important for the first test:** after one scan, **check
> `backend/storage/logs/iclock.log`**. Different ZKTeco firmwares format the push
> slightly differently — that log shows exactly what *your* device sends, so the parser
> in `AdmsIngestionService` can be fine‑tuned to match it if needed.

---

## Notes for the future (multi-branch)

- This same receiver works for **many devices** — each is identified by its **serial
  number** and auto-registers on first contact (under Devices). You assign its branch.
- For branches in **other locations**, point each device at the **public address** of
  the central server (once it's hosted) instead of a LAN IP. The device pushes out, so
  no per-branch server is needed.
- Before production: secure the endpoint (per-device token) and disable auto-register.
