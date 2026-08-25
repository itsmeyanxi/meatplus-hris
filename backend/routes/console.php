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

// Detect biometric PIN-reuse collisions (someone else's punches landing on an
// employee via the employee-number fallback). Runs HOURLY, but only to keep the
// review page current — it no longer notifies anyone. Announcing each collision the
// moment it was found produced 131 alerts at 12% read, while the two real problems
// sat unfixed for twelve days; the daily digest below now does the telling.
Schedule::command('attendance:detect-biometric-anomalies')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();

// THE daily biometric notice: offline terminals, PIN collisions and unmapped punches
// merged into one bell item per person, at the start of the working day. Sends
// nothing when nothing is wrong. Email rides along on Mondays and Fridays only.
Schedule::command('attendance:biometric-digest')
    ->dailyAt('07:00')
    ->withoutOverlapping()
    ->runInBackground();

// Scan employee records for data problems (missing payroll/attendance essentials,
// silent attendance). Detection stays frequent so the review page is current, but the
// DIGEST is sent once a day alongside the biometric one — running it hourly meant a
// fresh bell item at any hour, which is how 51 of these piled up at 18% read.
Schedule::command('employees:detect-data-issues')
    ->hourly()
    ->withoutOverlapping()
    ->runInBackground();

// …and the one daily digest for them, just after the biometric one so HR opens the
// bell to two notices rather than a day's worth. Anything an hourly pass found since
// yesterday is included — nothing detected between digests is skipped.
Schedule::command('employees:detect-data-issues --notify')
    ->dailyAt('07:05')
    ->withoutOverlapping()
    ->runInBackground();
