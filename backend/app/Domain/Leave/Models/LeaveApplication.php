<?php

namespace App\Domain\Leave\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class LeaveApplication extends Model
{
    use BelongsToCompany;
    use LogsActivity;
    use SoftDeletes;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['status', 'leave_type_id', 'date_from', 'date_to', 'days_count', 'decision_remarks'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('leave');
    }

    protected $fillable = [
        'company_id', 'employee_id', 'leave_type_id',
        'date_from', 'date_to', 'days_count', 'half_day', 'is_paid',
        'reason', 'attachment_path',
        'status', 'approved_by_user_id', 'decided_at', 'decision_remarks',
        'filed_by_user_id', 'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'date_from' => 'date',
            'date_to' => 'date',
            'days_count' => 'decimal:2',
            'is_paid' => 'boolean',
            'decided_at' => 'datetime',
            'submitted_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function filer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'filed_by_user_id');
    }
}
