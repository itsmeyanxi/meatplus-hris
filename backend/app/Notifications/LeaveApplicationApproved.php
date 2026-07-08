<?php

namespace App\Notifications;

use App\Domain\Leave\Models\LeaveApplication;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class LeaveApplicationApproved extends Notification
{
    use Queueable;

    public function __construct(
        public LeaveApplication $leave,
        public ?string $remarks = null,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $l = $this->leave;

        return [
            'type'    => 'leave.approved',
            'title'   => 'Leave request approved',
            'message' => "{$l->leaveType->code} leave ({$l->date_from->toDateString()} → {$l->date_to->toDateString()}) was approved"
                . ($this->remarks ? " · {$this->remarks}" : ''),
            'url'     => "/leaves/{$l->id}",
        ];
    }
}
