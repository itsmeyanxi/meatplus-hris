<?php

namespace App\Domain\Attendance\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class OvertimeRequest extends Model
{
    use BelongsToCompany;
    use LogsActivity;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['status', 'date', 'requested_hours', 'start_time', 'end_time', 'classification', 'decision_remarks'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('overtime');
    }

    protected $fillable = [
        'company_id', 'employee_id', 'date', 'start_time', 'end_time',
        'requested_hours', 'reason', 'classification', 'ticket_number',
        'attachment_path',
        'status', 'approved_by_user_id', 'decided_at', 'decision_remarks',
        'filed_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'requested_hours' => 'decimal:2',
            'decided_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
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
