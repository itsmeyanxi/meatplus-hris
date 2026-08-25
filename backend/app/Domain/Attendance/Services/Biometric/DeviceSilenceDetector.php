<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\AttendanceDevice;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Which biometric terminals have stopped contacting the server.
 *
 * A silent terminal is the most costly biometric failure there is: absence is judged
 * from MISSING punches, so every day a unit stays dark, everyone who normally punches
 * there is quietly marked ABSENT.
 *
 * Judged on `last_seen_at` (any /iclock request), never `last_event_at` (punches
 * only). The terminals poll every ~30 seconds around the clock — roughly 590 hits per
 * device per 5 hours, overnight included — so a multi-hour gap is a genuine outage,
 * while a quiet site with no punches is correctly left alone.
 *
 * This class only ANSWERS the question. Telling anyone about it belongs to
 * {@see BiometricDigestBuilder}, which folds outages in with the other biometric
 * problems so HR gets one daily bell item instead of a stream of separate ones.
 */
class DeviceSilenceDetector
{
    /**
     * Hours without ANY contact before a terminal counts as down.
     *
     * At one poll every ~30 seconds this is ~240 consecutive missed check-ins, far
     * beyond a network blip or a brief reboot, while still catching an overnight
     * failure in the morning digest.
     */
    public const SILENT_HOURS = 2;

    /** Employees counted as "normally punch here" — distinct people seen this recently. */
    private const AFFECTED_WINDOW_DAYS = 30;

    /**
     * Terminals currently out of contact, worst (longest silent) first.
     *
     * @return Collection<int, array{device:AttendanceDevice, company_id:?int, name:string, serial_no:?string, branch:?string, silent_hours:?int, employees:int}>
     */
    public function downDevices(): Collection
    {
        return AttendanceDevice::withoutGlobalScopes()
            ->with('company:id,code', 'branch:id,name')
            // A pending (unapproved) device is a different problem the connection
            // report already states plainly — its punches are REJECTED, not lost to a
            // dead terminal. Calling it "offline" would be wrong and confusing.
            ->where('is_active', true)
            ->get()
            ->map(function (AttendanceDevice $d) {
                $minutes = $d->silentMinutes();

                return [
                    'device' => $d,
                    'company_id' => $d->company_id ? (int) $d->company_id : null,
                    'name' => $d->name,
                    'serial_no' => $d->serial_no,
                    'branch' => $d->branch?->name,
                    'silent_hours' => $minutes === null ? null : intdiv($minutes, 60),
                    'silent_minutes' => $minutes,
                    'employees' => $this->employeesAffected($d),
                ];
            })
            // Null = never made contact, which is the worst case, so it sorts first.
            ->filter(fn (array $r) => $r['silent_minutes'] === null || $r['silent_minutes'] >= self::SILENT_HOURS * 60)
            ->sortByDesc(fn (array $r) => $r['silent_minutes'] ?? PHP_INT_MAX)
            ->values();
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
