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
        if ($this->late_minutes > 0) {
            return 'late';
        }
        // ANY punch on the day means the person was here, so the day must not read
        // as empty. `actual_out` counts too: a day with only an out-punch — a manually
        // added out, or a night shift whose in-punch was missed — computes 0 hours and
        // has no actual_in, so it used to fall through to 'no_record' and render as a
        // BLANK cell in the attendance matrix. That made a just-added manual log look
        // like it never saved. Hours stay 0 and payroll is unaffected (it reads
        // hours_worked / is_absent, never this status); this only stops real
        // attendance from being displayed as nothing.
        if ((float) $this->hours_worked > 0 || $this->actual_in || $this->actual_out) {
            return 'present';
        }

        return 'no_record';
    }
}
