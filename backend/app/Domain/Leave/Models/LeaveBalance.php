<?php

namespace App\Domain\Leave\Models;

use App\Domain\HRIS\Models\Employee;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveBalance extends Model
{
    protected $fillable = [
        'employee_id', 'leave_type_id', 'year',
        'opening_balance', 'accrued', 'granted_adhoc', 'used', 'carried_over_to_next',
    ];

    protected function casts(): array
    {
        return [
            'year' => 'integer',
            'opening_balance' => 'decimal:2',
            'accrued' => 'decimal:2',
            'granted_adhoc' => 'decimal:2',
            'used' => 'decimal:2',
            'carried_over_to_next' => 'decimal:2',
        ];
    }

    protected function currentBalance(): Attribute
    {
        return Attribute::make(
            get: fn () => (float) $this->opening_balance
                + (float) $this->accrued
                + (float) $this->granted_adhoc
                - (float) $this->used,
        );
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }
}
