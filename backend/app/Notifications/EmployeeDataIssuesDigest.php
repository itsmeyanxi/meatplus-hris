<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * One aggregated bell alert to HR (employee.update holders) when the daily scan
 * finds NEW employee-data problems. Aggregated on purpose — a single nudge to the
 * "Employee Data Issues" page — but it spells out WHAT is missing (a per-category
 * breakdown) so HR knows the shape of the work before opening it.
 */
class EmployeeDataIssuesDigest extends Notification
{
    use Queueable;

    /**
     * @param  array<int, array{label:string, count:int}>  $breakdown  open counts per category, most-important first
     */
    public function __construct(
        public int $newCount,
        public int $highCount,
        public int $openTotal,
        public string $url,
        public array $breakdown = [],
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $parts = array_map(fn ($b) => "{$b['count']} {$b['label']}", $this->breakdown);
        $what = $parts ? implode(' · ', $parts) : 'missing payroll/attendance data';
        $high = $this->highCount > 0 ? " · {$this->highCount} high priority" : '';

        return [
            'type' => 'employee.data_issues',
            'title' => "{$this->newCount} new employee data issue(s) to review",
            'message' => "{$this->openTotal} open{$high} — {$what}. Tap to review and fix.",
            'url' => $this->url,
            'breakdown' => $this->breakdown, // structured, for richer rendering later
        ];
    }
}
