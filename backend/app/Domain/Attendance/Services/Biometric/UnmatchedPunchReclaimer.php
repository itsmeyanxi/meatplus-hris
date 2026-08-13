<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Models\UnmatchedPunch;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Turns staged {@see UnmatchedPunch} rows into real time_logs once their device
 * PIN maps to an employee — because the employee was added, or their
 * biometric_user_id was set to that PIN. Recomputes the affected DTRs so the
 * recovered attendance shows immediately. Safe to run repeatedly.
 */
class UnmatchedPunchReclaimer
{
    /** Device attendance status -> direction (ZKTeco numeric + Hikvision strings). */
    private const STATUS_MAP = [
        '0' => 'in', '1' => 'out', '2' => 'break_out', '3' => 'break_in', '4' => 'in', '5' => 'out',
        'checkIn' => 'in', 'checkOut' => 'out', 'breakIn' => 'break_in', 'breakOut' => 'break_out',
        'overTimeIn' => 'in', 'overTimeOut' => 'out', 'overtimeIn' => 'in', 'overtimeOut' => 'out',
    ];

    public function __construct(private readonly DtrComputer $dtr) {}

    /**
     * Reclaim staged punches that now map to an employee.
     *
     * @param  string|null  $pin        limit to one device PIN (used by the on-remap hook)
     * @param  int|null     $companyId  limit to one company
     * @return array{reclaimed:int, employees:int}
     */
    public function reclaim(?string $pin = null, ?int $companyId = null): array
    {
        $reclaimed = 0;
        $affected = []; // employee_id => ['min' => date, 'max' => date]

        UnmatchedPunch::query()
            ->whereNull('reclaimed_at')
            ->when($pin !== null, fn ($q) => $q->where('pin', $pin))
            ->when($companyId !== null, fn ($q) => $q->where('company_id', $companyId))
            ->orderBy('id')
            ->chunkById(1000, function ($rows) use (&$reclaimed, &$affected) {
                $empCache = [];
                foreach ($rows as $u) {
                    $key = $u->company_id.'|'.$u->pin;
                    $emp = $empCache[$key] ??= $this->resolveEmployee((int) $u->company_id, (string) $u->pin);
                    if (! $emp) {
                        continue; // still unmapped — leave staged
                    }

                    $direction = self::STATUS_MAP[(string) $u->status] ?? 'in';

                    TimeLog::firstOrCreate(
                        ['device_id' => $u->device_key, 'source_event_id' => $u->source_event_id],
                        [
                            'company_id' => $emp->company_id,
                            'employee_id' => $emp->id,
                            'logged_at' => $u->logged_at,
                            'direction' => $direction,
                            'source' => 'biometric',
                            'metadata' => [
                                'device_key' => $u->device_key, 'pin' => $u->pin,
                                'verify' => $u->verify, 'status' => $u->status,
                                'raw' => $u->raw, 'reclaimed_at' => now()->toDateTimeString(),
                            ],
                        ],
                    );

                    $u->update(['reclaimed_at' => now()]);
                    $reclaimed++;

                    $d = CarbonImmutable::parse($u->logged_at)->toDateString();
                    $affected[$emp->id]['min'] = min($affected[$emp->id]['min'] ?? $d, $d);
                    $affected[$emp->id]['max'] = max($affected[$emp->id]['max'] ?? $d, $d);
                }
            });

        // Recompute DTRs for each employee across the recovered range (future-safe).
        foreach ($affected as $employeeId => $range) {
            $employee = Employee::withoutGlobalScopes()->find($employeeId);
            if (! $employee) {
                continue;
            }
            // Widen by a day so an overnight shift's tail is paired correctly.
            $from = CarbonImmutable::parse($range['min'])->subDay();
            $to = CarbonImmutable::parse($range['max'])->addDay();
            $this->dtr->computeForEmployee($employee, $from, $to);
        }

        return ['reclaimed' => $reclaimed, 'employees' => count($affected)];
    }

    /** Same rule as ingestion: match a device PIN to an employee by biometric_user_id, else employee_no. */
    private function resolveEmployee(int $companyId, string $pin): ?Employee
    {
        return Employee::query()
            ->withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->where(fn ($q) => $q->where('biometric_user_id', $pin)->orWhere('employee_no', $pin))
            ->orderByRaw('biometric_user_id = ? desc', [$pin])
            ->first();
    }
}
