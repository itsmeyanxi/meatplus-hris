<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * In-app alert to HR (holders of attendance.manage) when the system detects that a
 * device PIN belonging to one employee's record is actually enrolled on the
 * terminal for a DIFFERENT person — so someone else's punches are being credited
 * to that employee. Database channel only: it lands on the notification bell so HR
 * can correct the biometric mapping. Mirrors AttendanceRequestAwaitingApproval.
 */
class BiometricMappingAlert extends Notification
{
    use Queueable;

    public function __construct(
        public string $employeeName,   // whose record is catching the wrong punches
        public string $pin,
        public ?string $deviceName,    // who the device says the PIN belongs to
        public int $punches,
        public string $url,
        public int $employeeId,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $whose = $this->deviceName ? " (device shows it as “{$this->deviceName}”)" : '';

        return [
            'type' => 'biometric.mapping',
            'title' => 'Biometric ID mismatch needs review',
            'message' => "{$this->employeeName}'s record is receiving punches from PIN {$this->pin}{$whose} — {$this->punches} punch(es) may belong to someone else.",
            'url' => $this->url,
            'employee_id' => $this->employeeId,
            'pin' => $this->pin,
        ];
    }
}
