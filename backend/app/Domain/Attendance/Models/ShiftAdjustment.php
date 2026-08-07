<?php

namespace App\Domain\Attendance\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShiftAdjustment extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'employee_id', 'work_date',
        'is_rest_day', 'is_half_day', 'time_in', 'time_out', 'break_minutes',
        'reason', 'created_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'is_rest_day' => 'boolean',
            'is_half_day' => 'boolean',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
