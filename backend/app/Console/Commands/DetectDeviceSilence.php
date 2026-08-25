<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Services\Biometric\DeviceSilenceDetector;
use Illuminate\Console\Command;

/**
 * Alert IT and HR when a biometric terminal stops contacting the server, so a dead
 * unit is chased the same morning instead of quietly marking its people absent for
 * days. Safe to run repeatedly — an ongoing outage is not re-alerted inside the
 * cooldown, and a recovered terminal re-arms itself.
 */
class DetectDeviceSilence extends Command
{
    protected $signature = 'attendance:detect-device-silence';

    protected $description = 'Detect biometric terminals that have stopped contacting the server and alert IT/HR';

    public function handle(DeviceSilenceDetector $detector): int
    {
        $r = $detector->syncAndNotify();

        $this->info(
            "Terminals down: {$r['down']} — bell alerts sent: {$r['notified']}, "
            ."emails sent: {$r['emailed']}, recovered: {$r['recovered']}."
        );

        if (! $detector->emailAllowedToday()) {
            $this->line('Email is limited to Mondays and Fridays; the bell alert is unaffected.');
        }

        return self::SUCCESS;
    }
}
