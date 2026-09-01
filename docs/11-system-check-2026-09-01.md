# System Check — 1 September 2026

A health review of the ALL COMPANY HRIS, what was fixed during it, and what is left.
Every figure was read from the running system, not carried forward from an earlier report.

| | |
|---|---|
| Date | 2026-09-01 |
| Environment | Production, self-hosted (`DESKTOP-9BKU33K`) |
| Database | PostgreSQL 17, 105 MB |
| Commits from this check | `9ba18f0`, `652783f` |

---

## Summary

Four items were fixed, one of which was actively costing employees pay and another of which
could have destroyed the production database. Three items remain and need people rather than
code — two of them are the largest remaining risks.

| # | Item | Status |
|---|---|---|
| 1 | DTR fabricated time-ins (4,049 rows) | ✅ **Fixed + backfilled** |
| 2 | Test suite pointed at the production database | ✅ **Fixed** |
| 3 | No DTR regression coverage | ✅ **Fixed** (6 tests) |
| 4 | `iclock.log` growing unbounded (137 MB) | ✅ **Fixed** (rotation) |
| 5 | Four biometric terminals offline | ⛔ **Open** — needs physical access |
| 6 | 385 active employees with no work schedule | ⛔ **Open** — needs HR decisions |
| 7 | 277 active employees with no compensation record | ⛔ **Open** — needs HR/payroll |

---

## 1. Fixed — the DTR was inventing time-ins ⚠️ *(this one cost money)*

**What was wrong.** `logged_at` is a **mutable** Carbon (the model's `datetime` cast). The
16-hour shift cap in `DtrComputer` did:

```php
$cutoff = $actualIn->addMinutes(self::MAX_SHIFT_MINUTES);   // no copy()
```

That moved `$actualIn` itself 16 hours into the future and made `$cutoff` the same instant.
The filter that picks the out-punch then read *"later than X and no later than X"*, matched
nothing, and the day was saved with **a time-in that never happened and no time-out at all**.

**The damage.**

| | |
|---|---|
| Corrupted rows | **4,049** |
| Employees affected | **250** |
| Period | 19 Oct 2025 → 27 Aug 2026 |
| Night-differential minutes credited | **0 on every one** |
| Rest-day work earning no premium | 592 days |
| Holiday work earning no premium | 53 days |

It was still producing new bad rows the day it was fixed.

**Example** — employee 20240029, 2 Aug 2026. Real punches: `05:25`, `13:53`, `14:48`, `22:01`.
Stored: `actual_in = 21:25:20`, no time-out, 0.00 hours. `21:25:20` is `05:25:20` **plus
exactly 16 hours** — a timestamp that never existed.

**Fixed** in `DtrComputer::computeDay()` with `copy()`. The same bug class was fixed in
`scheduleOvernightDay()`, where `subDay()->startOfDay()` was rewriting the punch's own
timestamp and leaving the corrupted record in the collection `computeDay()` later reads.

**Backfilled.** A database dump was taken first
(`backups/meatplus_hris-20260901-150730.dump`). Only affected employees were recomputed, and
only across the span their bad rows covered:

```
Corrupted rows before: 4049 across 250 employees
Employees recomputed : 250, failed: 0
Corrupted rows after : 0
Recovered            : 4049 rows
```

21 rows still superficially match the pattern; all 21 have a **real punch at `actual_in`** and
are genuine coincidences, not the bug.

---

## 2. Fixed — the test suite was aimed at the production database 🔥

`phpunit.xml` had these lines **commented out**:

```xml
<!-- <env name="DB_CONNECTION" value="sqlite"/> -->
<!-- <env name="DB_DATABASE" value=":memory:"/> -->
```

With them commented, the suite inherits the production `.env` and runs against the **live
PostgreSQL database**. A single test using Laravel's standard `RefreshDatabase` trait would
have **dropped every table** — all payroll, attendance and employee data.

Nothing had triggered it because the suite contained only two scaffold tests. It was a trap
waiting for whoever wrote the first real test. Now uncommented, with a comment saying why it
must stay that way.

---

## 3. Fixed — DTR regression coverage

The DTR engine feeds payroll and has produced at least three correctness bugs (fabricated
time-ins, `detected_at` resetting on every scan, and the mutable-Carbon class generally). It
had **zero** regression protection.

`tests/Unit/DtrComputerTest.php` adds six cases covering the pairing rules:

- a span beyond the shift cap keeps the real time-in
- the out-punch is the latest one inside the cap
- the time-in is never exactly the cap after a real punch *(the bug's exact signature)*
- computing a day does not mutate the punches it was given
- a normal shift pairs and credits hours
- a second tap moments after arrival is not treated as a time-out

They use **no database** — `computeDay()` takes plain model instances — so they are fast and
cannot touch real data.

**Verified they work:** reverting the fix makes 3 of the 6 fail; restoring it makes all pass.
A test that has never been seen to fail is not evidence of anything.

---

## 4. Fixed — the ADMS log grew without limit

Nine terminals poll every ~30 seconds and every request was logged in full: **~4.5 MB a day,
137 MB when found**, never rotated.

Now size-rotated at 64 MB, keeping four archives. Two details worth knowing:

- The active file **keeps the same path**. `BiometricAnomalyDetector` reads `iclock.log` for
  the device USER records that identify PIN collisions; a dated filename would have silently
  broken that. The detector now reads the archives too, so names pushed before a roll-over
  are not lost.
- `clearstatcache()` runs before the size check. Without it PHP's stat cache reports the
  pre-rotation size and immediately rotates the fresh empty file — which it did once during
  testing, producing a stray 510-byte archive.

The 137 MB file was rotated to `iclock-20260901-151040.log`; the active log restarted clean.

---

## 5. Open — four terminals are offline ⛔

**Needs someone physically at the sites.** Every day a terminal is dark, everyone who
normally punches there is marked absent.

| Terminal | Company | Silent for | Punches (7d) |
|---|---|---|---|
| PMAI-ROSALES | PMAI | **never contacted the server** | 0 |
| BIO HATCHERY MB460 PLUS | NBC | 151 h | 0 |
| PMAI-BACOLOR | PMAI | 105 h | 20 |
| PMAI Magalang office | PMAI | 97 h | 0 |

Two more — **MTC** and **MB460 BIO NBC PANTRY** — are online but have taken **zero punches in
seven days**. Worth confirming they are still in use.

### Related: punch volume has not recovered

```
Aug 24    561 punches / 297 people      ← normal
Aug 26    547 / 284
Aug 27    128 /  83                     ← collapse
Aug 31     10 /   5
Sep 01     46 /  40                     ← today, ~8% of normal
```

This is **not** an ingestion fault. The terminals' own upload log matches the database exactly
— the punches are not arriving at all. The drop is concentrated in *MDP BIO Project Based*,
which normally carries ~390 punches from ~210 people a day. Whether that is terminals in a bad
state or a project crew genuinely finishing cannot be determined from the data.

---

## 6. Open — 385 active employees have no work schedule ⛔

**58% of the active workforce.** Without a schedule an employee is never absence-tracked, is
never credited required hours, and quietly falls out of payroll proration.

| Company | Unscheduled |
|---|---|
| PASEI | 275 |
| DEMO *(sandbox — ignore)* | 108 |
| PMAI | 1 |
| MPP-MAIN | 1 |

Each needs HR to say which shift the person works. This cannot be inferred safely — a wrong
schedule generates false absences, which cost pay just as surely as none.

---

## 7. Open — 277 active employees have no compensation record ⛔

Payroll cannot compute them at all. **Effectively all of them are PASEI (275).**

Alongside: 218 missing a position, 215 missing an employment type, 195 missing a department.
Roughly 1,088 open data issues in total, already surfaced on the Data Issues page and in the
daily digest.

---

## Other findings worth recording

**Fingerprint enrolment has no fallback.** A worn or injured finger makes an employee
**invisible with no signal at all** — the terminal records nothing for a failed scan, so there
is no error to detect. One employee went 19 days with zero punches while working, on a
terminal serving 44 colleagues at his exact shift time. Two mitigations: enrol a second finger
or card/face as backup, and add a detector for *"has a schedule, is enrolled, has produced no
punches for N days"*.

**Notifications are still barely read** — 109 of 649 (16.8%) all-time. The daily entry dialog
shipped today should move this; worth re-measuring in a week.

**Roughly 13% of attended days credit no hours** — 643 in-without-out and 172 out-without-in
against 5,294 complete days in August. Nothing queues these for HR to chase.

**14,961 staged punches** across 264 PINs remain unmatched — real attendance that never
reached a DTR.

**The GitHub repository is public.** Left as-is at the owner's instruction; recorded here
because the documentation in it describes the public IP, open ports and open issues.

---

## Healthy

- Queue: **0 queued, 0 failed** — no mail failure has ever occurred
- Application errors: **none since 15 July**
- Indexes present on every hot column (`time_logs`, `daily_time_records`, `unmatched_punches`)
- Backups green — nightly local dump 22:00 and off-site Supabase copy 22:30
- Disk: 801 GB free of 931 GB
- All scheduled jobs running; Laravel scheduler firing every minute

---

## Recommended order of work

1. **Get the four terminals back online** — every day costs real attendance *(physical)*
2. **Assign schedules to the 385 unscheduled employees** — unlocks absence tracking and
   correct pay *(HR)*
3. **Create compensation records for the 277** — payroll cannot run for them *(HR/payroll)*
4. **Enrol backup biometric methods** — stop one bad finger hiding an employee for weeks
5. **Chase the 815 zero-hour punch days** and the 14,961 staged punches
6. **Extend test coverage to `PayrollComputer`** — same risk profile as the DTR engine had

Items 1–3 are the largest remaining exposure, and none of them is a software problem.
