<?php

namespace App\Domain\Attendance\Services;

use App\Domain\Attendance\Models\AttendanceCorrection;
use App\Domain\Attendance\Models\DailyTimeRecord;
use Carbon\Carbon;

/**
 * Applies an APPROVED attendance correction onto the employee's daily time
 * record. The record is then marked `locked` so the DTR engine will not
 * overwrite the manual correction on a future recompute.
 */
class AttendanceCorrectionApplier
{
    /**
     * Fields a correction is permitted to write onto the DTR. Single-sourced here
     * so the FormRequest validation and this applier can never drift apart.
     */
    public const CORRECTABLE_FIELDS = [
        'actual_in', 'actual_out', 'hours_worked', 'is_absent', 'is_rest_day', 'remarks',
    ];

    public function apply(AttendanceCorrection $correction): DailyTimeRecord
    {
        $field = $correction->field_to_correct;
        $dateStr = $correction->work_date->toDateString();

        $dtr = DailyTimeRecord::firstOrNew([
            'employee_id' => $correction->employee_id,
            'work_date' => $dateStr,
        ]);
        $dtr->company_id = $dtr->company_id ?? $correction->company_id;

        // Defensive: validation already restricts the field, but never persist a
        // phantom locked row for something we don't know how to apply.
        if (! in_array($field, self::CORRECTABLE_FIELDS, true)) {
            return $dtr;
        }

        $dtr->{$field} = $this->castValue($field, $correction->new_value, $dateStr);
        $this->reconcile($dtr, $field);

        // Lock so DtrComputer leaves this manual correction untouched on recompute,
        // and flag it as a manual adjustment for reporting.
        $dtr->status = 'locked';
        $dtr->is_adjusted = true;
        $dtr->save();

        return $dtr;
    }

    /** Keep dependent fields consistent with the one that was corrected. */
    private function reconcile(DailyTimeRecord $dtr, string $field): void
    {
        if (in_array($field, ['actual_in', 'actual_out'], true)) {
            // A recorded punch means the employee was present that day.
            $dtr->is_absent = false;
        }

        if ($field === 'is_absent' && $dtr->is_absent) {
            // An absent day carries no worked time or in/out punches.
            $dtr->actual_in = null;
            $dtr->actual_out = null;
            $dtr->hours_worked = 0;
            $dtr->late_minutes = 0;
            $dtr->undertime_minutes = 0;
            $dtr->overtime_minutes = 0;
        }
    }

    private function castValue(string $field, ?string $value, string $dateStr): mixed
    {
        $value = trim((string) $value);

        return match ($field) {
            'actual_in', 'actual_out' => $this->toDateTime($value, $dateStr),
            'hours_worked' => is_numeric($value) ? round((float) $value, 2) : 0,
            'is_absent', 'is_rest_day' => in_array(strtolower($value), ['1', 'true', 'yes', 'y'], true),
            default => $value, // remarks
        };
    }

    /** Accept "HH:MM", "HH:MM:SS", or a full datetime; bare times combine with the work date. */
    private function toDateTime(string $value, string $dateStr): ?string
    {
        if ($value === '') {
            return null;
        }

        try {
            if (preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $value)) {
                return Carbon::parse("{$dateStr} {$value}")->toDateTimeString();
            }

            return Carbon::parse($value)->toDateTimeString();
        } catch (\Exception) {
            return null;
        }
    }
}
