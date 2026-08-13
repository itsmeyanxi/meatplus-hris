<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;

/**
 * Pulls punch events from a biometric terminal into time_logs and recomputes the
 * affected daily time records. Idempotent: re-pulling an overlapping window never
 * duplicates punches (deduped on device + device-event id).
 */
class BiometricSyncService
{

    public function __construct(private readonly DtrComputer $dtr) {}

    /**
     * Sync one device. Returns a summary: inserted, duplicates, unmapped person ids,
     * employees recomputed, and the window used.
     */
    public function sync(AttendanceDevice $device): array
    {
        $deviceKey = $this->deviceKey($device);
        // Punches are anchored to the device's local wall-clock so they line up with
        // schedule times (which are also naive local times) during DTR computation.
        $tz = $device->tz();

        // Pull from a little before the last sync (boundary safety); dedup handles overlap.
        // When the device clock is untrusted (use_server_time), its event timestamps don't
        // align with server time, so a last-sync window can sit in the device's "future"
        // and miss events — pull a wide window instead and let dedup handle overlap.
        $to = Carbon::now($tz);
        if ($device->use_server_time) {
            $from = $to->copy()->subDays(3);
        } else {
            $from = $device->last_synced_at
                ? $device->last_synced_at->copy()->subMinutes(15)
                : $to->copy()->subDays(7);
        }

        $client = new HikvisionIsapiClient($device);
        $events = $client->fetchEvents($from, $to);

        // Process oldest-first so same-day in/out inference is stable.
        usort($events, fn ($a, $b) => strcmp($a['time'], $b['time']));

        // Testing aid: anchor punches to the server clock (newest event = now),
        // keeping each event's relative spacing so in/out pairs stay correct.
        $shiftSeconds = 0;
        if ($device->use_server_time && $events) {
            $maxTs = max(array_map(fn ($e) => Carbon::parse($e['time'])->timestamp, $events));
            $shiftSeconds = Carbon::now()->timestamp - $maxTs;
        }

        $inserted = 0;
        $duplicate = 0;
        $unmapped = [];
        $affected = [];           // employee_id => ['min' => Ymd, 'max' => Ymd]
        $dayCount = [];           // employee_id => [Ymd => running punch count]
        $employeeCache = [];      // person_id => Employee|null
        $maxEventTime = null;

        foreach ($events as $e) {
            $employee = $employeeCache[$e['person_id']]
                ??= BiometricPunch::resolveEmployee($device->company_id, $e['person_id']);

            $ts = Carbon::parse($e['time'])->addSeconds($shiftSeconds)->setTimezone($tz);

            if (! $employee) {
                $unmapped[$e['person_id']] = ($unmapped[$e['person_id']] ?? 0) + 1;
                // Stage rather than drop — reclaimed once this person_id maps to an
                // employee (newly added, or biometric_user_id set to this ID).
                \App\Domain\Attendance\Models\UnmatchedPunch::firstOrCreate(
                    ['device_key' => $deviceKey, 'source_event_id' => $e['event_id']],
                    [
                        'company_id' => $device->company_id,
                        'pin' => $e['person_id'],
                        'logged_at' => $ts->toDateTimeString(),
                        'status' => (string) ($e['status'] ?? ''),
                        'raw' => $e['name'] ?? null,
                        'source' => 'biometric',
                    ],
                );

                continue;
            }

            $date = $ts->toDateString();
            $maxEventTime = $maxEventTime && $maxEventTime->gte($ts) ? $maxEventTime : $ts;

            // Seed the day counter from existing punches so inference survives re-runs.
            $dayCount[$employee->id][$date] ??= TimeLog::query()
                ->where('employee_id', $employee->id)
                ->whereDate('logged_at', $date)
                ->count();

            $direction = $this->direction($e['status'], $dayCount[$employee->id][$date]);

            $log = TimeLog::firstOrCreate(
                ['device_id' => $deviceKey, 'source_event_id' => $e['event_id']],
                [
                    'company_id' => $employee->company_id,
                    'employee_id' => $employee->id,
                    'logged_at' => $ts->toDateTimeString(),
                    'direction' => $direction,
                    'source' => 'biometric',
                    'ip_address' => $device->ip_address,
                    'metadata' => [
                        'device_id' => $device->id,
                        'attendance_status' => $e['status'],
                        'person_id' => $e['person_id'],
                        'name' => $e['name'],
                    ],
                ],
            );

            if ($log->wasRecentlyCreated) {
                $inserted++;
                $dayCount[$employee->id][$date]++;
                $affected[$employee->id]['min'] = min($affected[$employee->id]['min'] ?? $date, $date);
                $affected[$employee->id]['max'] = max($affected[$employee->id]['max'] ?? $date, $date);
            } else {
                $duplicate++;
            }
        }

        // Recompute DTRs only for employees/dates that actually changed.
        foreach ($affected as $employeeId => $range) {
            $employee = Employee::find($employeeId);
            if ($employee) {
                $this->dtr->computeForEmployee(
                    $employee,
                    CarbonImmutable::parse($range['min']),
                    CarbonImmutable::parse($range['max']),
                );
            }
        }

        $device->forceFill([
            'last_synced_at' => now(),
            'last_event_at' => $maxEventTime ?? $device->last_event_at,
        ])->save();

        $summary = [
            'device' => $device->name,
            'window' => [$from->toDateTimeString(), $to->toDateTimeString()],
            'events_seen' => count($events),
            'inserted' => $inserted,
            'duplicates' => $duplicate,
            'unmapped' => $unmapped,
            'employees_recomputed' => count($affected),
        ];

        if ($unmapped) {
            Log::warning('Biometric sync: unmapped person IDs', [
                'device' => $device->id,
                'person_ids' => array_keys($unmapped),
            ]);
        }

        return $summary;
    }

    /** Prefer an explicit biometric_user_id mapping, else fall back to employee_no. */
    /** Resolve direction from the device status, or alternate in/out by day position. */
    private function direction(?string $status, int $priorCountToday): string
    {
        if ($status && isset(BiometricPunch::STATUS_MAP[$status])) {
            return BiometricPunch::STATUS_MAP[$status];
        }

        // No usable status: first punch of the day is IN, then alternate.
        return $priorCountToday % 2 === 0 ? 'in' : 'out';
    }

    /** Stable per-device key for time_logs.device_id (fits the 50-char column). */
    private function deviceKey(AttendanceDevice $device): string
    {
        return substr($device->serial_no ?: 'DEVICE-'.$device->id, 0, 50);
    }
}
