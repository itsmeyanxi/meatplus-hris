# Alerts & notifications

What the system tells people, when, and through which channel. Two kinds of message live
here and they follow opposite rules:

- **Requests waiting on a person** — an OT filing, a leave application, an access request.
  These are **instant**, because somebody is blocked until they act.
- **Problems the system found** — a dead terminal, a bad biometric mapping, an employee
  record missing payroll data. These are **digested once a day**, because nobody is blocked
  and a stream of them is worse than one summary.

## Why the split exists

The system used to announce every problem the moment it found it. The result, measured:

| | Sent | Unread |
|---|---|---|
| Biometric mapping alerts | 131 | 88% |
| All notifications | 485 | 79% |

131 alerts announced the **same two** collisions over and over, and both stayed unfixed for
twelve days while people had 30–60 unread items each. Volume was the problem, not awareness.
Detection still runs often — announcing that often is what buried the signal.

## The channels

| Channel | Who sees it | Notes |
|---|---|---|
| **In-app bell** | Everyone with the relevant permission | The default. Backed by the `notifications` table |
| **Email** | Same recipients | **Only on Mondays and Fridays** — start of the week and before the weekend, when someone is around to act. Queued, so it needs the queue worker running |

Email is deliberately restricted. The bell is unrestricted, so nothing is ever hidden on the
other days — the limit only controls which days a problem also lands in an inbox.

> Mail sends through Gmail SMTP and is **queued**. If the `queue:work` process is down,
> emails silently pile up in the `jobs` table. See [04-operations.md](04-operations.md).

## What gets sent

### Daily digests (07:00)

| Digest | Covers | Goes to |
|---|---|---|
| **Biometric health** (`attendance:biometric-digest`) | Offline terminals · PIN reuse collisions · staged unmapped punches · terminals with a collapsing match rate | `device.manage` (IT) + `attendance.manage` (HR), per company |
| **Employee data issues** (`employees:detect-data-issues --notify`, 07:05) | Missing payroll/attendance essentials, silent attendance | `employee.update`, per company |

Both send **nothing when nothing is wrong** — a daily "all clear" is exactly the noise this
design replaces.

The biometric digest orders itself by consequence, worst first, because a dark terminal costs
people a day's pay while a low match rate merely loses data:

```
OFFLINE: PMAI-ROSALES (Salvacion Rosales, Pangasinan) down for 9 hours
         — 13 people there are being marked ABSENT.
WRONG PERSON: Saludaga, Jeffrey is receiving punches from PIN 20240029
         (device shows it as "Junary") — 84 punches, open 11 days.
15,007 punches are staged against PINs that match no employee.
```

**One notification per person per day**, not one per problem. Someone who oversees several
companies gets their problems **merged into a single notice**, and each person only sees the
companies they actually cover — a PASEI-only user is not told about a PMAI terminal.

### Instant notifications

| Notification | Trigger | Goes to |
|---|---|---|
| `AttendanceRequestAwaitingApproval` | OT / UT / OB / COA / correction filed | Manager + department head + global approvers (cross-company) |
| `LeaveApplicationApproved` / `Rejected` | Leave decided | The filer |
| `AccessRequest*` | Access request raised, advanced, decided | Supervisor → HR → IT, by stage |
| `SupervisorApprovalReminder` | Someone nudges an approver by hand | That supervisor |

These stay instant on purpose. Batching an approval request into a daily digest would delay
somebody's overtime or leave by up to a day.

## How a digest avoids repeating itself

- **Biometric:** the digest *is* the cadence. It runs once a day and re-states whatever is
  still open, so a problem that stays broken keeps being reported — with its age, which is
  the part that makes people act. No separate cooldown is needed.
- **Employee data:** tracked by `first_notified_at`. Anything found by an hourly scan since
  the last digest is reported in the next one, whether or not that particular run detected
  it. Nothing found between digests is skipped.

Detection and announcement are separate everywhere: `BiometricAnomalyDetector::sync()` and
`EmployeeDataIssueDetector::sync(false)` persist findings for the review pages and say
nothing. Only the daily commands notify.

> **`detected_at` means first seen.** Both detectors used to rewrite it on every scan, so a
> problem open for weeks kept reporting itself as found just now and "how long has this been
> outstanding" was unanswerable. It is now stamped once, when the issue first appears.

## Who receives what

Recipients resolve through `HrRecipients::withPermissionForCompany($permission, $companyId)`,
which returns active users holding that permission **for that company**, plus anyone holding
it globally (a null-company role assignment — typically super/IT admins). So HR of company A
is never notified about company B's employees, while a cross-company admin sees both.

| Alert | Permission(s) |
|---|---|
| Biometric health digest | `device.manage`, `attendance.manage` |
| Employee data issues | `employee.update` |
| Attendance requests | `attendance.approve.any`, `attendance.manage`, plus the subject's manager and department head |

## Adding a new alert

1. Detect in a service that **persists** its findings and does **not** notify.
2. Schedule that detection as often as it's useful in `backend/routes/console.php`.
3. If a person must act, add it to an existing daily digest rather than creating a new
   notification type. A new bell item is a real cost — check the read rates above.
4. Resolve recipients with `HrRecipients`, never by querying users directly, or you will
   leak one company's problems to another's staff.
5. Let the caller choose channels (`via()` returns what it was handed) instead of consulting
   the calendar inside the notification — it keeps the Monday/Friday rule in one testable
   place.

## Known gaps

- **No retention policy.** The `notifications` table only grows; there were 381 unread at the
  time of writing and nothing prunes read or superseded items.
- **Deleted notification classes leave rows behind.** Old rows keep a `type` naming a class
  that may no longer exist. The bell renders from the stored `data` JSON and never resolves
  the class, so this is harmless — but don't write code that instantiates `$notification->type`.
