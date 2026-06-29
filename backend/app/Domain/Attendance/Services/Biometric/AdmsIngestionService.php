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
        if (strtoupper($table) !== 'ATTLOG' || trim($body) === '') {
            return 0;
        }

        $device = $this->resolveDevice($sn);
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
            $status = isset($cols[2]) ? trim($cols[2]) : '';
            if ($pin === '' || $timeStr === '') {
                continue;
            }

            $employee = $employeeCache[$pin] ??= $this->resolveEmployee($device->company_id, $pin);
            if (! $employee) {
                continue; // unmapped PIN — skip
            }

            $ts = Carbon::parse($timeStr, $tz);
            $date = $ts->toDateString();

            $dayCount[$employee->id][$date] ??= TimeLog::query()
                ->where('employee_id', $employee->id)
                ->whereDate('logged_at', $date)
                ->count();

            $direction = self::STATUS_MAP[$status]
                ?? ($dayCount[$employee->id][$date] % 2 === 0 ? 'in' : 'out');

            $log = TimeLog::firstOrCreate(
                ['device_id' => $deviceKey, 'source_event_id' => "{$pin}|{$timeStr}|{$status}"],
                [
                    'company_id' => $employee->company_id,
                    'employee_id' => $employee->id,
                    'logged_at' => $ts->toDateTimeString(),
                    'direction' => $direction,
                    'source' => 'biometric',
                    'metadata' => ['device_id' => $device->id, 'pin' => $pin, 'status' => $status, 'raw' => $line],
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

    /** Find the device by serial, registering it on first contact. */
    private function resolveDevice(string $sn): AttendanceDevice
    {
        return AttendanceDevice::firstOrCreate(
            ['serial_no' => $sn],
            [
                'company_id' => Company::query()->orderBy('id')->value('id'),
                'name' => "ZKTeco {$sn}",
                'vendor' => 'zkteco',
                'ip_address' => '0.0.0.0', // push device — no inbound IP needed
                'port' => 80,
                'timezone' => 'Asia/Manila',
                'username' => 'adms',
                'password' => 'adms',
                'is_active' => true,
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
