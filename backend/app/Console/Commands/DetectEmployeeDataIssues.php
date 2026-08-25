<?php

namespace App\Console\Commands;

use App\Domain\HRIS\Services\EmployeeDataIssueDetector;
use Illuminate\Console\Command;

/**
 * Scan active employees for data problems (missing payroll/attendance essentials,
 * silent attendance). Safe to run repeatedly; issues auto-resolve once fixed.
 *
 * Detection and announcement are separate on purpose: the scheduler runs this hourly
 * WITHOUT --notify to keep the review page current, then once each morning WITH it so
 * HR gets one digest a day instead of a bell item at any hour.
 */
class DetectEmployeeDataIssues extends Command
{
    protected $signature = 'employees:detect-data-issues {--notify : Also send the digest for anything HR has not been told about yet}';

    protected $description = 'Detect employee-data problems; with --notify, digest them to HR';

    public function handle(EmployeeDataIssueDetector $detector): int
    {
        $r = $detector->sync($this->option('notify'));

        $this->info("Employee data issues — new: {$r['new']}, ongoing: {$r['ongoing']}, resolved: {$r['resolved']}, open: {$r['open']}.");

        if ($this->option('notify')) {
            $this->line($r['notified'] > 0
                ? "Digest sent for {$r['notified']} company/companies."
                : 'Nothing new to report — no digest sent.');
        }

        return self::SUCCESS;
    }
}
