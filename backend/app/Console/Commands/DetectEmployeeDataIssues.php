<?php

namespace App\Console\Commands;

use App\Domain\HRIS\Services\EmployeeDataIssueDetector;
use Illuminate\Console\Command;

/**
 * Scan active employees for data problems (missing payroll/attendance essentials,
 * silent attendance) and digest-notify HR of new ones. Safe to run repeatedly;
 * issues auto-resolve once the data is fixed.
 */
class DetectEmployeeDataIssues extends Command
{
    protected $signature = 'employees:detect-data-issues';

    protected $description = 'Detect employee-data problems and notify HR of new ones';

    public function handle(EmployeeDataIssueDetector $detector): int
    {
        $r = $detector->syncAndNotify();

        $this->info("Employee data issues — new: {$r['new']}, ongoing: {$r['ongoing']}, resolved: {$r['resolved']}, open: {$r['open']}.");

        return self::SUCCESS;
    }
}
