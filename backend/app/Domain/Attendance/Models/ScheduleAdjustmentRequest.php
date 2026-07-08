<?php

namespace App\Domain\Attendance\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScheduleAdjustmentRequest extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'employee_id',
        'from_date', 'to_date',
        'shift_start', 'break_start', 'break_end', 'shift_end',
        'reason',
        'status', 'decided_by_user_id', 'decided_at', 'decision_remarks',
        'filed_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'from_date'  => 'date',
            'to_date'    => 'date',
            'decided_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by_user_id');
    }

    public function filer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'filed_by_user_id');
    }
}
