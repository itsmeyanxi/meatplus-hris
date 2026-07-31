<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * A manual nudge sent to an employee's DIRECT SUPERVISOR (their
 * manager_employee_id) asking them to review a pending leave or COA request.
 * Triggered by the "Notify supervisor" button, so the dedicated supervisor is
 * the one prompted to decide. Database channel → shows on their bell regardless
 * of which company they're currently viewing.
 */
class SupervisorApprovalReminder extends Notification
{
    use Queueable;

    public function __construct(
        public string $kind,          // "Leave" | "Certificate of Attendance"
        public string $employeeName,
        public ?string $date,         // Y-m-d, or null
        public string $url,
        public int $requestId,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $when = $this->date ? " · {$this->date}" : '';

        return [
            'type' => 'approval.reminder',
            'title' => "Please review a {$this->kind} request",
            'message' => "{$this->employeeName}{$when} is awaiting your approval",
            'url' => $this->url,
            'request_id' => $this->requestId,
        ];
    }
}
