<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeBenefit extends Model
{
    protected $table = 'employee_benefits';

    protected $fillable = [
        'employee_id', 'type', 'is_active', 'effective_date', 'enrollment_date',
        'plan', 'beneficiary', 'payment_type', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'effective_date' => 'date',
            'enrollment_date' => 'date',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
