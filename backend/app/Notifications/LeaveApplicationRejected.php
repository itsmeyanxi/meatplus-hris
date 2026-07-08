<?php

namespace App\Notifications;

use App\Domain\Leave\Models\LeaveApplication;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class LeaveApplicationRejected extends Notification
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
            'type'    => 'leave.rejected',
            'title'   => 'Leave request rejected',
            'message' => "{$l->leaveType->code} leave ({$l->date_from->toDateString()} → {$l->date_to->toDateString()}) was rejected"
                . ($this->remarks ? " · {$this->remarks}" : ''),
            'url'     => "/leaves/{$l->id}",
        ];
    }
}
