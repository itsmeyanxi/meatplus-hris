<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Models\UnmatchedPunch;
use App\Domain\Attendance\Services\Biometric\UnmatchedPunchReclaimer;
use Illuminate\Console\Command;

/**
 * Converts staged unmatched biometric punches into real time_logs for any PIN that
 * now maps to an employee, and recomputes their DTRs. Runs on a schedule and can be
 * invoked after correcting biometric IDs.
 */
class ReclaimUnmatchedPunches extends Command
{
    protected $signature = 'attendance:reclaim-unmatched {--pin= : Only this device PIN} {--company= : Only this company id}';

    protected $description = 'Attach staged unmatched biometric punches to employees whose ID now maps, and recompute DTRs.';

    public function handle(UnmatchedPunchReclaimer $reclaimer): int
    {
        $pending = UnmatchedPunch::whereNull('reclaimed_at')->count();
        $this->info("Pending unmatched punches: {$pending}");

        $res = $reclaimer->reclaim($this->option('pin') ?: null, $this->option('company') ? (int) $this->option('company') : null);

        $this->info("Reclaimed {$res['reclaimed']} punches for {$res['employees']} employees.");
        $this->info('Still pending (PIN still not mapped): '.UnmatchedPunch::whereNull('reclaimed_at')->count());

        return self::SUCCESS;
    }
}
