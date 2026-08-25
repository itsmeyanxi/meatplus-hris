<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

// Poll biometric terminals for new punches every 5 minutes.
Schedule::command('attendance:sync-biometric')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->runInBackground();

// Attach any staged (unmatched) biometric punches whose device ID has since been
// mapped to an employee, then recompute their DTRs. Cheap when nothing is pending.
Schedule::command('attendance:reclaim-unmatched')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->runInBackground();

// Alert HR to biometric PIN-reuse collisions (someone else's punches landing on an
// employee via the employee-number fallback). Runs HOURLY so HR hears about a bad
// mapping the same morning it happens rather than the next day; only NEWLY-opened
// anomalies notify, so repeating the scan every hour never re-pings the bell.
Schedule::command('attendance:detect-biometric-anomalies')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();

// Alert IT/HR when a terminal stops contacting the server. Judged on the ~30-second
// iclock heartbeat, NOT on punch activity, so a quiet site is never mistaken for a
// dead one. Hourly: a silent terminal marks its people absent every day it stays
// down, so it must be chased the same morning. The in-app bell fires as soon as an
// outage is detected; email is limited to Mondays and Fridays (see the detector).
Schedule::command('attendance:detect-device-silence')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();

// Scan employee records for data problems (missing payroll/attendance essentials,
// silent attendance) and send HR one aggregated digest. Runs HOURLY: the digest is
// only sent for issues detected as NEW in that pass, so an hourly cadence surfaces a
// problem within the hour without turning into an hourly notification.
Schedule::command('employees:detect-data-issues')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();
