<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Models\Company;
use Carbon\Carbon;
use Carbon\CarbonImmutable;

/**
 * Ingests pushed attendance from ZKTeco terminals (ADMS / "iclock" protocol).
 * The device POSTs ATTLOG records; we map each PIN to an employee, store the
 * punch idempotently, and recompute the affected daily records.
 */
class AdmsIngestionService
{
    /** ZKTeco attendance status code -> our TimeLog.direction. */
    private const STATUS_MAP = [
        '0' => 'in',         // check in
        '1' => 'out',        // check out
        '2' => 'break_out',  // break out
        '3' => 'break_in',   // break in
        '4' => 'in',         // overtime in
        '5' => 'out',        // overtime out
    ];

    public function __construct(private readonly DtrComputer $dtr) {}

    /**
     * Handshake reply for `GET /iclock/cdata` — tells the device our options.
     * Realtime=1 makes it push each scan as it happens.
     */
    public function handshake(string $sn): string
    {
        $this->resolveDevice($sn); // register the device on first contact

        return implode("\r\n", [
            "GET OPTION FROM: {$sn}",
            'Stamp=9999',
            'OpStamp=9999',
            'ErrorDelay=30',
            'Delay=30',
            'TransTimes=00:00;23:59',
            'TransInterval=1',
            'TransFlag=1111000000',
            'Realtime=1',
            'Encrypt=0',
        ])."\r\n";
    }

    /**
     * Handle a `POST /iclock/cdata` push. Only ATTLOG (punches) is ingested;
     * other tables (OPERLOG, USERINFO, …) are acknowledged and ignored.
     * Returns the number of new punches stored.
     */
    public function receive(string $sn, string $table, string $body): int
    {
        $table = strtoupper($table);

        // The device's enrolled-user list — captured so we can reconcile each
        // person's on-device User ID with their HRIS biometric_user_id.
        if ($table === 'USERINFO' && trim($body) !== '') {
            $this->captureUserInfo($sn, $body);

            return 0;
        }

        if ($table !== 'ATTLOG' || trim($body) === '') {
            return 0;
        }

        $device = $this->resolveDevice($sn);

        // Serial allowlist. Only devices an admin has activated (and assigned to
        // the correct company) may push punches. Unknown serials are recorded as
        // pending so the admin can see and approve them, but their data is
        // rejected here — this is what makes exposing /iclock to the internet
        // safe against forged punches from unknown terminals.
        if (! $device->is_active) {
            $device->forceFill(['last_event_at' => now()])->save();
            \Illuminate\Support\Facades\Log::warning(
                "ADMS: rejected punches from unapproved device serial '{$sn}'. "
                ."Approve it under Attendance Devices (set its company + activate) to accept."
            );

            return 0;
        }

        $tz = $device->tz();
        $deviceKey = substr($sn ?: 'ZK-'.$device->id, 0, 50);

        $employeeCache = [];
        $dayCount = [];
        $affected = [];
        $inserted = 0;

        foreach (preg_split('/\r\n|\n|\r/', trim($body)) as $line) {
            $cols = explode("\t", $line);
            if (count($cols) < 2) {
                continue;
            }

            $pin = trim($cols[0]);
            $timeStr = trim($cols[1]);
            $verify    = isset($cols[2]) ? trim($cols[2]) : '';   // biometric method (0=pw,1=fp,4=face,255=other)
            $statusCol = isset($cols[3]) ? trim($cols[3]) : null; // attendance status col — null when absent

            // IMPORTANT: $verify must NOT be used as a status fallback.
            // Verify codes (1=fingerprint) collide with status codes (1=out),
            // causing fingerprint check-ins to be recorded as outs.
            if ($pin === '' || $timeStr === '') {
                continue;
            }

            $employee = $employeeCache[$pin] ??= $this->resolveEmployee($device->company_id, $pin);
            if (! $employee) {
                continue; // unmapped PIN — skip
            }

            $ts = Carbon::parse($timeStr, $tz);
            $date = $ts->toDateString();

            // Seed the in/out alternation from this employee's BIOMETRIC punches only.
            // Counting web/manual/upload punches here would offset the parity and flip
            // a real device check-in to "out" whenever a web punch already exists that day.
            $dayCount[$employee->id][$date] ??= TimeLog::query()
                ->where('employee_id', $employee->id)
                ->where('source', 'biometric')
                ->whereDate('logged_at', $date)
                ->count();

            // Determine direction.
            // Only trust the device status code for explicit check-out/break/OT codes (1,2,3,5).
            // Status 0 and 4 both mean "in", so they're safe to trust too.
            // However, some ZKTeco firmware sends status=1 for ALL punches regardless of direction
            // (device work-code button stuck on "Out"). To guard against this, we only use the
            // device status when it makes contextual sense: if every punch so far today for this
            // employee already has a stored direction, trust the alternating count instead.
            // Simple rule: always use alternating count — it is reliable for standard in/out
            // terminals where employees scan once per event.
            $direction = $dayCount[$employee->id][$date] % 2 === 0 ? 'in' : 'out';

            // Keep $verify in the idempotency key (not $statusCol) to stay consistent
            // with records already stored under the 3-column format.
            $status = $statusCol ?? $verify;

            $log = TimeLog::firstOrCreate(
                ['device_id' => $deviceKey, 'source_event_id' => "{$pin}|{$timeStr}|{$status}"],
                [
                    'company_id' => $employee->company_id,
                    'employee_id' => $employee->id,
                    'logged_at' => $ts->toDateTimeString(),
                    'direction' => $direction,
                    'source' => 'biometric',
                    'metadata' => ['device_id' => $device->id, 'pin' => $pin, 'verify' => $verify, 'status' => $status, 'raw' => $line],
                ],
            );

            if ($log->wasRecentlyCreated) {
                $inserted++;
                $dayCount[$employee->id][$date]++;
                $affected[$employee->id]['min'] = min($affected[$employee->id]['min'] ?? $date, $date);
                $affected[$employee->id]['max'] = max($affected[$employee->id]['max'] ?? $date, $date);
            }
        }

        foreach ($affected as $employeeId => $range) {
            if ($employee = Employee::find($employeeId)) {
                $this->dtr->computeForEmployee(
                    $employee,
                    CarbonImmutable::parse($range['min']),
                    CarbonImmutable::parse($range['max']),
                );
            }
        }

        $device->forceFill(['last_synced_at' => now(), 'last_event_at' => now()])->save();

        return $inserted;
    }

    /**
     * Parse a pushed USERINFO table (the device's enrolled users) and persist the
     * on-device User ID → Name map to storage/app/device_users/{serial}.json so
     * an admin can reconcile it against HRIS biometric IDs.
     */
    private function captureUserInfo(string $sn, string $body): void
    {
        $users = [];
        foreach (preg_split('/\r\n|\n|\r/', trim($body)) as $line) {
            if (stripos($line, 'PIN=') === false) {
                continue;
            }
            $pin = null;
            $name = null;
            foreach (preg_split('/\t/', $line) as $part) {
                if (preg_match('/(?:USER\s+)?PIN=(.*)/i', $part, $m)) {
                    $pin = trim($m[1]);
                } elseif (preg_match('/Name=(.*)/i', $part, $m)) {
                    $name = trim($m[1]);
                }
            }
            if ($pin !== null && $pin !== '') {
                $users[$pin] = $name;
            }
        }

        if (! $users) {
            return;
        }

        $dir = storage_path('app/device_users');
        if (! is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $file = $dir.'/'.preg_replace('/[^A-Za-z0-9_-]/', '', $sn).'.json';
        $existing = is_file($file) ? (json_decode(file_get_contents($file), true) ?: []) : [];
        file_put_contents($file, json_encode(array_replace($existing, $users), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }

    /** Find the device by serial, registering it on first contact. */
    private function resolveDevice(string $sn): AttendanceDevice
    {
        return AttendanceDevice::firstOrCreate(
            ['serial_no' => $sn],
            [
                'company_id' => Company::query()->orderBy('id')->value('id'), // placeholder until an admin assigns the real one
                'name' => "PENDING - ZKTeco {$sn}",
                'vendor' => 'zkteco',
                'ip_address' => '0.0.0.0', // push device — no inbound IP needed
                'port' => 80,
                'timezone' => 'Asia/Manila',
                'username' => 'adms',
                'password' => 'adms',
                'is_active' => false, // pending: an admin must approve + set the company before punches are accepted
            ],
        );
    }

    /** Prefer an explicit biometric_user_id mapping, else fall back to employee_no. */
    private function resolveEmployee(int $companyId, string $pin): ?Employee
    {
        return Employee::query()
            ->where('company_id', $companyId)
            ->where(fn ($q) => $q->where('biometric_user_id', $pin)->orWhere('employee_no', $pin))
            ->orderByRaw('biometric_user_id = ? desc', [$pin])
            ->first();
    }
}
