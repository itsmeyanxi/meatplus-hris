<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * One aggregated bell alert to HR (employee.update holders) when the daily scan
 * finds NEW employee-data problems — missing payroll/attendance essentials or
 * silent attendance. Aggregated on purpose: a single actionable nudge to the
 * "Employee Data Issues" review page, never one notification per employee.
 */
class EmployeeDataIssuesDigest extends Notification
{
    use Queueable;

    public function __construct(
        public int $newCount,
        public int $highCount,
        public int $openTotal,
        public string $url,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $high = $this->highCount > 0 ? " · {$this->highCount} high priority" : '';

        return [
            'type' => 'employee.data_issues',
            'title' => "{$this->newCount} new employee data issue(s) to review",
            'message' => "{$this->openTotal} open{$high}. Missing payroll/attendance data or silent attendance — review and fix.",
            'url' => $this->url,
        ];
    }
}
