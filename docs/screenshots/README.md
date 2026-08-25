# Screenshots — where they go and what to capture

## Where to put the files

**Save every screenshot into this folder:**

```
c:\Users\ALL COMPANY HRIS\Documents\meatplus-hris\docs\screenshots\
```

Use the **exact filenames** in the table below. The turnover document already contains the
image links, so a screenshot appears in the document the moment you drop the file in — no
editing required. A link whose file is missing simply shows as a broken image; nothing else
breaks.

| Setting | Value |
|---|---|
| Format | **PNG** |
| Width | 1600 px or wider (a maximised browser window on this PC is fine) |
| Zoom | Browser at 100% |
| Naming | Lower-case, exactly as listed — `01-dashboard.png`, not `01 Dashboard.PNG` |

Capture with **Win + Shift + S** (Snipping Tool) or **Win + PrtScn**, then rename and move
the file here.

---

## ⚠️ Before you capture anything: redact

These screenshots go into a document that may leave the company. Every screen below shows
real employee data. **Do not publish raw captures.**

**Must be blurred or covered in any screenshot:**

- Salary, rate, and any pay figures
- Government ID numbers (SSS, TIN, PhilHealth, Pag-IBIG)
- Bank account numbers
- Home addresses, personal phone numbers, personal email addresses
- Birthdates

**Safer alternative:** log in as a **demo/sandbox company** user (company `DEMO — Demo Co
(Sandbox)`) and capture there instead. The layout is identical and no real person's data is
exposed. This is the recommended approach for anything showing employee records or payroll.

Employee *names* are acceptable in a UI screenshot if the document stays internal. If it goes
to an external party, blur those too.

---

## The captures needed

### Required — referenced directly by the turnover document

| # | Filename | Screen | Navigate to | Show |
|---|---|---|---|---|
| 01 | `01-dashboard.png` | Dashboard | `/dashboard` after login | Summary cards, the company switcher, the notification bell |
| 02 | `02-employees-list.png` | Employee list | `/employees` | The list with filters and the import/export buttons visible |
| 03 | `03-attendance-dtr.png` | DTR matrix | `/attendance/dtr` | A month of the matrix, showing the colour-coded day states |
| 04 | `04-time-logs.png` | Time logs | `/attendance/time-logs` | Raw punches with the device/company filters |
| 05 | `05-payroll-payslip.png` | Payslip | `/my-payslips` → open one | A payslip layout — **redact all figures** |
| 06 | `06-device-connection-report.png` | Biometric health | `/devices` | The connection report: states, Last contact vs Last punch, match rate, staged |
| 07 | `07-access-levels.png` | Roles & permissions | `/access-levels` | The role × permission matrix |

### Recommended — strengthen the handover

| # | Filename | Screen | Navigate to | Why it helps |
|---|---|---|---|---|
| 08 | `08-login.png` | Login | `/login` | First screen a new user sees |
| 09 | `09-company-switcher.png` | Tenant switch | Click the company name in the header | Shows how multi-tenancy is experienced |
| 10 | `10-attendance-request.png` | Filing a request | `/attendance/requests/overtime` → New | The approval workflow's entry point |
| 11 | `11-approval-center.png` | Approvals | `/my-team` or the dashboard approvals card | Where an approver acts |
| 12 | `12-biometric-issues.png` | PIN collisions | `/attendance/biometric-issues` | The review page for §11 issue #3 |
| 13 | `13-audit-trail.png` | Audit trail | `/audit-trail` | Evidence of the audit capability for §14 |
| 14 | `14-notification-bell.png` | Daily digest | Click the bell with a digest present | Shows the §13.4 alerting output |
| 15 | `15-employee-profile.png` | 201 file | `/employees/{id}` | The record structure — **redact heavily, or use the demo company** |

### Infrastructure — not browser screenshots

| # | Filename | Capture | How |
|---|---|---|---|
| 16 | `16-scheduled-tasks.png` | Windows Task Scheduler | `taskschd.msc`, filter to the *Meatplus HRIS* tasks, show Status + Last Run Result |
| 17 | `17-server-processes.png` | Running processes/ports | PowerShell: `Get-NetTCPConnection -State Listen \| Where-Object { $_.LocalPort -in 80,5433,8000,8001 }` |
| 18 | `18-device-config.png` | Terminal settings | Photograph a ZKTeco terminal's **Comm. → Cloud Server Setting** screen — the single most useful image for whoever re-configures a device |

---

## Adding a screenshot to a document

If you capture something not on this list, reference it with a normal Markdown image link
from any doc in `docs/`:

```markdown
![Short description of what this shows](screenshots/19-your-file.png)
```

Always write a real description in the brackets — it is what a reader sees if the image fails
to load, and it is what makes the document usable by someone reading it as plain text.

---

## Keeping these current

Re-capture a screenshot when the screen it shows changes materially — a redesign, a new
column, a renamed field. A screenshot that no longer matches the software is worse than no
screenshot, because a reader will trust it. Note the re-capture in the change history of
[10-system-turnover.md](../10-system-turnover.md).
