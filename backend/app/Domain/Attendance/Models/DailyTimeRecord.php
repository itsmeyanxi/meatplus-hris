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
        'hours_worked', 'late_minutes', 'undertime_minutes',
        'overtime_minutes', 'night_diff_minutes',
        'holiday_type', 'is_rest_day', 'is_absent', 'is_on_leave',
        'leave_application_id', 'status', 'remarks',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'actual_in' => 'datetime',
            'actual_out' => 'datetime',
            'hours_worked' => 'decimal:2',
            'is_rest_day' => 'boolean',
            'is_absent' => 'boolean',
            'is_on_leave' => 'boolean',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
