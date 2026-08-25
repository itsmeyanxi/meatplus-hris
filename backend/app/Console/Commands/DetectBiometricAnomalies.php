<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Services\Biometric\BiometricAnomalyDetector;
use Illuminate\Console\Command;

/**
 * Scan for PIN-reuse collisions (someone else's punches landing on an employee via
 * the employee-number fallback) and alert HR on the notification bell for any new
 * ones. Safe to run repeatedly — resolved issues are not re-notified.
 */
class DetectBiometricAnomalies extends Command
{
    protected $signature = 'attendance:detect-biometric-anomalies';

    protected $description = 'Detect biometric PIN-reuse collisions and notify HR of new ones';

    public function handle(BiometricAnomalyDetector $detector): int
    {
        $result = $detector->sync();

        $this->info("Biometric anomalies — new: {$result['new']}, ongoing: {$result['ongoing']}, resolved: {$result['resolved']}.");

        return self::SUCCESS;
    }
}
