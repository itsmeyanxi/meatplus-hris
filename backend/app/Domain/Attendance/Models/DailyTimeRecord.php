<?php

namespace App\Domain\Attendance\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DailyTimeRecord extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'employee_id', 'work_date',
        'scheduled_in', 'scheduled_out', 'actual_in', 'actual_out',
        'hours_worked', 'day_fraction', 'late_minutes', 'undertime_minutes',
        'overtime_minutes', 'night_diff_minutes',
        'holiday_type', 'is_rest_day', 'is_absent', 'is_on_leave', 'is_adjusted',
        'leave_application_id', 'status', 'remarks',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'actual_in' => 'datetime',
            'actual_out' => 'datetime',
            'hours_worked' => 'decimal:2',
            'day_fraction' => 'decimal:2',
            'is_rest_day' => 'boolean',
            'is_absent' => 'boolean',
            'is_on_leave' => 'boolean',
            'is_adjusted' => 'boolean',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** Single colour-friendly classification of the day, shared by the API and summaries. */
    public function dayStatus(): string
    {
        if ($this->is_on_leave) {
            return 'leave';
        }
        if ($this->is_absent) {
            return 'absent';
        }
        if ($this->holiday_type && (float) $this->hours_worked === 0.0) {
            return 'holiday';
        }
        if ($this->is_rest_day && (float) $this->hours_worked === 0.0) {
            return 'rest_day';
        }
        // Half a shift: exactly ONE side of the day was captured, so the record is
        // broken and needs HR to complete it (a forgotten punch-out, a manually added
        // lone out, or a night shift whose in-punch was missed). It used to be
        // invisible — a lone out-punch has no actual_in and computes 0 hours, so it
        // fell through to 'no_record' and the matrix drew a BLANK cell, making a
        // just-saved manual log look like it never saved. Flagged distinctly rather
        // than shown as a normal present day, since the times are incomplete.
        //
        // Both-null is NOT incomplete: that is a no-punch day (absent, or a
        // punch-exempt employee credited their scheduled hours above).
        if (((bool) $this->actual_in) !== ((bool) $this->actual_out)) {
            return 'incomplete';
        }
        if ($this->late_minutes > 0) {
            return 'late';
        }
        if ((float) $this->hours_worked > 0 || $this->actual_in) {
            return 'present';
        }

        return 'no_record';
    }
}
