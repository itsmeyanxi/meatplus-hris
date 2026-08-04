<?php

namespace App\Domain\Attendance\Services;

use App\Domain\Attendance\Models\CertificateOfAttendanceRequest;
use App\Domain\Attendance\Models\OfficialBusinessRequest;
use App\Domain\Attendance\Models\OvertimeRequest;
use Illuminate\Support\Collection;

/**
 * Resolves approved OB / COA / OT into normalised "attendance event" rows so the
 * time-log views can show them alongside raw biometric punches.
 *
 * These aren't hardware punches — OB is off-site work (no punch at all), COA
 * certifies a punch the employee missed, and OT is approved extra hours — so a
 * raw punch log leaves them invisible. Each row is clearly labelled with its
 * type so it reads as "Official Business", "Certificate of Attendance" or
 * "Overtime", never as a blank/ambiguous entry.
 *
 * Company scoping is inherited from the models' BelongsToCompany global scope,
 * so callers get exactly the active company's data (same as the punch query).
 */
class AttendanceEventResolver
{
    /** Backstop so an unbounded "all employees" query can never flood the feed. */
    private const PER_SOURCE_CAP = 600;

    /**
     * @param  int|null  $employeeId  limit to one employee (null = all in scope)
     * @param  int|null  $departmentId  optional department filter
     * @return Collection<int, array<string, mixed>>  newest-first
     */
    public function resolve(?string $from, ?string $to, ?int $employeeId = null, ?int $departmentId = null): Collection
    {
        $events = collect();

        $applyScope = function ($q, string $dateColumn) use ($employeeId, $departmentId, $from, $to) {
            $q->where('status', 'approved')
                ->with(
                    'employee:id,employee_no,first_name,last_name,company_id,department_id',
                    'employee.company:id,code,trade_name,legal_name',
                    'approver:id,name',
                )
                ->orderByDesc($dateColumn)
                ->limit(self::PER_SOURCE_CAP);
            if ($employeeId) {
                $q->where('employee_id', $employeeId);
            }
            if ($departmentId) {
                $q->whereHas('employee', fn ($e) => $e->where('department_id', $departmentId));
            }
            if ($to) {
                $q->whereDate($dateColumn, '<=', $to);
            }

            return $q;
        };

        // --- Official Business (window: date .. date_to) ---
        $obQuery = OfficialBusinessRequest::query();
        $applyScope($obQuery, 'date');
        foreach ($obQuery->get() as $ob) {
            $end = ($ob->date_to ?? $ob->date)?->toDateString();
            if ($from && $end && $end < $from) {
                continue; // window ends before the range
            }
            $events->push($this->row('ob', 'Official Business', $ob, [
                'date' => $ob->date?->toDateString(),
                'date_to' => $ob->date_to?->toDateString(),
                'start_time' => $this->hm($ob->start_time),
                'end_time' => $this->hm($ob->end_time),
                'detail' => $ob->location,
                'reason' => $ob->purpose,
            ]));
        }

        // --- Certificate of Attendance (a certified, missed punch) ---
        $coaQuery = CertificateOfAttendanceRequest::query();
        $applyScope($coaQuery, 'work_date');
        if ($from) {
            $coaQuery->whereDate('work_date', '>=', $from);
        }
        foreach ($coaQuery->get() as $coa) {
            $events->push($this->row('coa', 'Certificate of Attendance', $coa, [
                'date' => $coa->work_date?->toDateString(),
                'start_time' => $this->hm($coa->claimed_time_in),
                'end_time' => $this->hm($coa->claimed_time_out),
                'missed_punch' => $coa->missed_punch,
                'reason' => $coa->reason,
            ]));
        }

        // --- Overtime (filed & approved extra hours) ---
        // Only OT actually filed in the app counts — bulk-imported/auto-marked OT
        // (no filer, no ticket) is excluded so the feed matches what payroll credits.
        $otQuery = OvertimeRequest::query()
            ->where(fn ($q) => $q->whereNotNull('filed_by_user_id')->orWhereNotNull('ticket_number'));
        $applyScope($otQuery, 'date');
        if ($from) {
            $otQuery->whereDate('date', '>=', $from);
        }
        foreach ($otQuery->get() as $ot) {
            $events->push($this->row('ot', 'Overtime', $ot, [
                'date' => $ot->date?->toDateString(),
                'start_time' => $this->hm($ot->start_time),
                'end_time' => $this->hm($ot->end_time),
                'hours' => $ot->requested_hours !== null ? (float) $ot->requested_hours : null,
                'detail' => $ot->classification ? ucwords(str_replace('_', ' ', $ot->classification)) : null,
                'reason' => $ot->reason,
            ]));
        }

        return $events->sortByDesc('date')->values();
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Model  $request  the OB/COA/OT request
     * @param  array<string, mixed>  $extra
     */
    private function row(string $type, string $label, $request, array $extra): array
    {
        $employee = $request?->employee;
        $company = $employee?->relationLoaded('company') ? $employee->company : null;
        $approver = $request?->relationLoaded('approver') ? $request->approver : null;

        return array_merge([
            'type' => $type,
            'label' => $label,
            'employee_id' => $employee?->id,
            'employee_no' => $employee?->employee_no,
            'employee_name' => $employee?->full_name,
            'company_code' => $company?->code,
            'company_name' => $company?->trade_name ?: $company?->legal_name,
            'date' => null,
            'date_to' => null,
            'start_time' => null,
            'end_time' => null,
            'hours' => null,
            'missed_punch' => null,
            'detail' => null,
            'reason' => null,
            // Who approved it and when — surfaced on the time-log views and export.
            // Preformatted (app timezone) so the UI and CSV show it as-is.
            'approved_by' => $approver?->name,
            'approved_at' => $request?->decided_at?->format('M d, Y g:i A'),
        ], $extra);
    }

    /** Normalise a stored time to HH:MM (handles "08:00:00", full datetimes, or null). */
    private function hm($value): ?string
    {
        if (! $value) {
            return null;
        }
        $s = (string) $value;
        if (preg_match('/(\d{2}:\d{2})/', $s, $m)) {
            return $m[1];
        }

        return $s;
    }
}
