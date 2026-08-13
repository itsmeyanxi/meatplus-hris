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
