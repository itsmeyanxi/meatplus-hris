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
// employee via the employee-number fallback). Once a day is plenty; only NEW issues
// notify, so this never spams the bell.
Schedule::command('attendance:detect-biometric-anomalies')
    ->dailyAt('06:30')
    ->withoutOverlapping()
    ->runInBackground();

// Scan employee records for data problems (missing payroll/attendance essentials,
// silent attendance) and send HR one aggregated digest of new issues.
Schedule::command('employees:detect-data-issues')
    ->dailyAt('06:45')
    ->withoutOverlapping()
    ->runInBackground();
