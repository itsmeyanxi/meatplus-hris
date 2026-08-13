<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\HRIS\Models\Employee;

/**
 * Shared biometric-punch primitives used by every ingestion path (ZKTeco/ADMS,
 * Hikvision) and by the unmatched-punch reclaimer, so the device-status → direction
 * map and the PIN → employee matching rule live in ONE place.
 */
final class BiometricPunch
{
    /**
     * Device attendance status -> our TimeLog.direction.
     * ZKTeco numeric (0 in, 1 out, 2 break-out, 3 break-in, 4 OT-in, 5 OT-out) and
     * Hikvision strings share one table; the key spaces never collide.
     */
    public const STATUS_MAP = [
        '0' => 'in', '1' => 'out', '2' => 'break_out', '3' => 'break_in', '4' => 'in', '5' => 'out',
        'checkIn' => 'in', 'checkOut' => 'out', 'breakIn' => 'break_in', 'breakOut' => 'break_out',
        'overTimeIn' => 'in', 'overTimeOut' => 'out', 'overtimeIn' => 'in', 'overtimeOut' => 'out',
    ];

    /**
     * Match a device PIN to an employee: by biometric_user_id first, else employee_no.
     * $withoutScopes lets callers outside a request (reclaimer, jobs) bypass the
     * company scope while still filtering explicitly by company_id.
     */
    public static function resolveEmployee(int $companyId, string $pin, bool $withoutScopes = false): ?Employee
    {
        $query = $withoutScopes ? Employee::query()->withoutGlobalScopes() : Employee::query();

        return $query
            ->where('company_id', $companyId)
            ->where(fn ($q) => $q->where('biometric_user_id', $pin)->orWhere('employee_no', $pin))
            ->orderByRaw('biometric_user_id = ? desc', [$pin])
            ->first();
    }
}
