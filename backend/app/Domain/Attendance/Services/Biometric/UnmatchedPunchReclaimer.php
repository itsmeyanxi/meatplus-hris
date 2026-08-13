<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Models\UnmatchedPunch;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use Carbon\CarbonImmutable;

/**
 * Turns staged {@see UnmatchedPunch} rows into real time_logs once their device
 * PIN maps to an employee — because the employee was added, or their
 * biometric_user_id was set to that PIN. Recomputes the affected DTRs so the
 * recovered attendance shows immediately. Safe to run repeatedly.
 */
class UnmatchedPunchReclaimer
{
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
        $base = fn () => UnmatchedPunch::query()
            ->whereNull('reclaimed_at')
            ->when($pin !== null, fn ($q) => $q->where('pin', $pin))
            ->when($companyId !== null, fn ($q) => $q->where('company_id', $companyId));

        // Resolve PINs against an in-memory index built once per company in scope,
        // instead of a query per distinct PIN on every (15-minute) run.
        $indexes = [];
        foreach ($base()->distinct()->pluck('company_id') as $cid) {
            $indexes[(int) $cid] = $this->buildPinIndex((int) $cid);
        }

        // Fallback for a person re-enrolled on ANOTHER company's device: the punch
        // is staged under the device's company, but their record lives elsewhere.
        // Only PINs that resolve to exactly ONE employee across all companies are
        // included, so colliding IDs (employee_no "3" in three companies) are never
        // guessed — they stay staged. The device company's own match still wins.
        $globalIndex = $this->buildGlobalUniquePinIndex();

        $reclaimed = 0;
        $affected = []; // employee_id => ['min' => date, 'max' => date]

        $base()->orderBy('id')->chunkById(1000, function ($rows) use (&$reclaimed, &$affected, $indexes, $globalIndex) {
            foreach ($rows as $u) {
                $match = $indexes[(int) $u->company_id][(string) $u->pin]
                    ?? $globalIndex[(string) $u->pin]
                    ?? null;
                if (! $match) {
                    continue; // still unmapped — leave staged
                }
                $empId = $match['id'];

                TimeLog::firstOrCreate(
                    ['device_id' => $u->device_key, 'source_event_id' => $u->source_event_id],
                    [
                        // Attendance belongs to the employee's company, which may
                        // differ from the device's when reclaimed cross-company.
                        'company_id' => $match['company_id'],
                        'employee_id' => $empId,
                        'logged_at' => $u->logged_at,
                        'direction' => BiometricPunch::STATUS_MAP[(string) $u->status] ?? 'in',
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
                $affected[$empId]['min'] = min($affected[$empId]['min'] ?? $d, $d);
                $affected[$empId]['max'] = max($affected[$empId]['max'] ?? $d, $d);
            }
        });

        // Recompute DTRs for each affected employee across the recovered range.
        $employees = Employee::withoutGlobalScopes()->whereIn('id', array_keys($affected))->get()->keyBy('id');
        foreach ($affected as $employeeId => $range) {
            $employee = $employees->get($employeeId);
            if (! $employee) {
                continue;
            }
            // Widen by a day so an overnight shift's tail is paired correctly.
            $this->dtr->computeForEmployee(
                $employee,
                CarbonImmutable::parse($range['min'])->subDay(),
                CarbonImmutable::parse($range['max'])->addDay(),
            );
        }

        return ['reclaimed' => $reclaimed, 'employees' => count($affected)];
    }

    /**
     * PIN -> ['id' => employee id, 'company_id' => company] for one company,
     * biometric_user_id taking precedence over employee_no (mirrors
     * BiometricPunch::resolveEmployee's ordering).
     *
     * @return array<string,array{id:int,company_id:int}>
     */
    private function buildPinIndex(int $companyId): array
    {
        $employees = Employee::withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->get(['id', 'biometric_user_id', 'employee_no']);

        $index = [];
        foreach ($employees as $e) {
            if ($e->biometric_user_id) {
                $index[(string) $e->biometric_user_id] = ['id' => $e->id, 'company_id' => $companyId];
            }
        }
        foreach ($employees as $e) {
            $index[(string) $e->employee_no] ??= ['id' => $e->id, 'company_id' => $companyId];
        }

        return $index;
    }

    /**
     * PIN -> employee across ALL companies, but ONLY for PINs that resolve to a
     * single employee — a collision (same PIN in two companies) is dropped so it's
     * never assigned by guess. biometric_user_id is authoritative: a PIN that is an
     * ambiguous biometric id is excluded even if it coincidentally matches one
     * employee_no. Used as a cross-company fallback for re-enrolled people.
     *
     * @return array<string,array{id:int,company_id:int}>
     */
    private function buildGlobalUniquePinIndex(): array
    {
        $employees = Employee::withoutGlobalScopes()->get(['id', 'company_id', 'biometric_user_id', 'employee_no']);

        $byBio = []; // pin => [ [id, company_id], ... ]
        $byNo = [];
        foreach ($employees as $e) {
            if ($e->biometric_user_id) {
                $byBio[(string) $e->biometric_user_id][] = ['id' => $e->id, 'company_id' => $e->company_id];
            }
            $byNo[(string) $e->employee_no][] = ['id' => $e->id, 'company_id' => $e->company_id];
        }

        $index = [];
        // Lower-priority employee_no matches first, so a unique biometric id can
        // override them below.
        foreach ($byNo as $pin => $hits) {
            if (count($hits) === 1) {
                $index[(string) $pin] = $hits[0];
            }
        }
        foreach ($byBio as $pin => $hits) {
            if (count($hits) === 1) {
                $index[(string) $pin] = $hits[0]; // authoritative single biometric match
            } else {
                unset($index[(string) $pin]); // ambiguous biometric id — trust nothing for this PIN
            }
        }

        return $index;
    }
}
