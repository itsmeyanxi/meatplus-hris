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
