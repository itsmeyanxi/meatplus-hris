<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Services\Biometric\BiometricAnomalyDetector;
use Illuminate\Console\Command;

/**
 * Scan for PIN-reuse collisions — someone else's punches landing on an employee via
 * the employee-number fallback — and keep the review page current. Safe to run
 * repeatedly; collisions that stop appearing are auto-resolved.
 *
 * Detection only: HR hears about these once a day from attendance:biometric-digest,
 * never from here. Announcing each one on discovery is what buried them.
 */
class DetectBiometricAnomalies extends Command
{
    protected $signature = 'attendance:detect-biometric-anomalies';

    protected $description = 'Detect biometric PIN-reuse collisions (reported by the daily digest, not here)';

    public function handle(BiometricAnomalyDetector $detector): int
    {
        $result = $detector->sync();

        $this->info("Biometric anomalies — new: {$result['new']}, ongoing: {$result['ongoing']}, resolved: {$result['resolved']}.");

        return self::SUCCESS;
    }
}
