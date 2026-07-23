<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app notification sent to a request's approvers (direct manager, department
 * head, and the global attendance approvers) the moment an employee files an
 * attendance request — COA, OT, OB, UT or a correction. Database channel only:
 * it surfaces on the recipient's notification bell regardless of which company
 * they are currently viewing, so a cross-company manager still sees it.
 */
class AttendanceRequestAwaitingApproval extends Notification
{
    use Queueable;

    public function __construct(
        public string $kind,          // e.g. "Certificate of Attendance"
        public string $employeeName,
        public ?string $workDate,     // Y-m-d, or null
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
        $when = $this->workDate ? " · {$this->workDate}" : '';

        return [
            'type' => 'attendance.awaiting',
            'title' => "{$this->kind} awaiting your approval",
            'message' => "{$this->employeeName}{$when}",
            'url' => $this->url,
            'request_id' => $this->requestId,
        ];
    }
}
