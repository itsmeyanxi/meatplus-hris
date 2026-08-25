<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Identity\Support\HrRecipients;
use App\Notifications\BiometricDeviceOfflineAlert;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Alerts when a biometric terminal stops contacting the server.
 *
 * A silent terminal is the most costly biometric failure: absence is judged from
 * MISSING punches, so every day a unit stays dark, everyone who normally punches
 * there is quietly marked ABSENT. Until now nothing detected it — a dead terminal
 * could only be found by opening the Biometric Connection Report and reading it.
 *
 * Judged on `last_seen_at` (any /iclock request), never `last_event_at` (punches
 * only). The terminals poll every ~30 seconds around the clock — roughly 590 hits
 * per device per 5 hours, overnight included — so a multi-hour gap is a genuine
 * outage, while a quiet site with no punches is correctly left alone.
 */
class DeviceSilenceDetector
{
    /**
     * Hours without ANY contact before a terminal counts as down.
     *
     * At one poll every ~30 seconds this is ~240 consecutive missed check-ins, far
     * beyond a network blip or a brief reboot, while still surfacing an overnight
     * failure the same morning.
     */
    public const SILENT_HOURS = 2;

    /** Do not repeat the same alert on the same channel inside this many hours. */
    public const RENOTIFY_COOLDOWN_HOURS = 24;

    /** Employees counted as "normally punch here" — distinct people seen this recently. */
    private const AFFECTED_WINDOW_DAYS = 30;

    /**
     * Detect down terminals, alert the right people, and re-arm recovered ones.
     *
     * @return array{down:int, notified:int, emailed:int, recovered:int}
     */
    public function syncAndNotify(): array
    {
        $emailAllowed = $this->emailAllowedToday();
        $down = 0;
        $notified = 0;
        $emailed = 0;
        $recovered = 0;

        foreach (AttendanceDevice::withoutGlobalScopes()->with('company:id,code', 'branch:id,name')->get() as $device) {
            // A pending (unapproved) device is a separate problem the connection report
            // already states plainly — its punches are being REJECTED, not lost to a
            // dead terminal. Alerting "offline" for it would be wrong and confusing.
            if (! $device->is_active) {
                continue;
            }

            $minutes = $device->silentMinutes();
            $isDown = $minutes === null || $minutes >= self::SILENT_HOURS * 60;

            if (! $isDown) {
                // Back in touch: clear the stamps so the NEXT outage alerts immediately
                // rather than being swallowed by a stale cooldown.
                if ($device->silence_notified_at || $device->silence_emailed_at) {
                    $device->forceFill(['silence_notified_at' => null, 'silence_emailed_at' => null])->save();
                    $recovered++;
                }

                continue;
            }

            $down++;

            $channels = [];
            if ($this->due($device->silence_notified_at)) {
                $channels[] = 'database';
            }
            if ($emailAllowed && $this->due($device->silence_emailed_at)) {
                $channels[] = 'mail';
            }

            if (! $channels) {
                continue; // still down, but everyone due has already been told
            }

            if (! $this->alert($device, $minutes, $channels)) {
                continue; // nobody to tell — leave the stamps so it retries next run
            }

            $stamp = [];
            if (in_array('database', $channels, true)) {
                $stamp['silence_notified_at'] = now();
                $notified++;
            }
            if (in_array('mail', $channels, true)) {
                $stamp['silence_emailed_at'] = now();
                $emailed++;
            }
            $device->forceFill($stamp)->save();
        }

        return ['down' => $down, 'notified' => $notified, 'emailed' => $emailed, 'recovered' => $recovered];
    }

    /**
     * Email goes out on MONDAYS and FRIDAYS only — start of the week and before the
     * weekend, when someone is actually around to go and look at the terminal. The
     * in-app bell is unrestricted, so an outage is never hidden on the other days;
     * this only limits which days it also lands in an inbox.
     */
    public function emailAllowedToday(?Carbon $now = null): bool
    {
        $day = ($now ?? now())->dayOfWeek;

        return $day === Carbon::MONDAY || $day === Carbon::FRIDAY;
    }

    /** Whether a channel is due again (never sent, or past the cooldown). */
    private function due(?Carbon $lastSent): bool
    {
        return $lastSent === null
            || $lastSent->lessThanOrEqualTo(now()->subHours(self::RENOTIFY_COOLDOWN_HOURS));
    }

    /**
     * Notify IT (device.manage) and HR (attendance.manage) for the device's company.
     * Both matter: IT restores the terminal, HR carries the absences it caused.
     *
     * @param  array<int, string>  $channels
     * @return bool  whether anyone was actually notified
     */
    private function alert(AttendanceDevice $device, ?int $minutes, array $channels): bool
    {
        $companyId = $device->company_id ? (int) $device->company_id : null;

        $users = HrRecipients::withPermissionForCompany('device.manage', $companyId)
            ->concat(HrRecipients::withPermissionForCompany('attendance.manage', $companyId))
            ->unique('id')
            ->values();

        if ($users->isEmpty()) {
            return false;
        }

        // Carry the company so a cross-company admin lands on the right context
        // instead of an empty page for whichever company they happen to be viewing.
        $url = '/devices'.($companyId ? '?company='.$companyId : '');

        Notification::send($users, new BiometricDeviceOfflineAlert(
            deviceName: $device->name,
            serialNo: $device->serial_no,
            companyCode: $device->company?->code,
            branchName: $device->branch?->name,
            silentHours: $minutes === null ? null : intdiv($minutes, 60),
            employeesAffected: $this->employeesAffected($device),
            url: $url,
            deviceId: (int) $device->id,
            channels: $channels,
        ));

        return true;
    }

    /** How many distinct people this terminal has been taking punches from lately. */
    private function employeesAffected(AttendanceDevice $device): int
    {
        if (! $device->serial_no) {
            return 0;
        }

        return (int) DB::table('time_logs')
            ->where('device_id', $device->serial_no)
            ->where('logged_at', '>=', now()->subDays(self::AFFECTED_WINDOW_DAYS))
            ->distinct()
            ->count('employee_id');
    }
}
