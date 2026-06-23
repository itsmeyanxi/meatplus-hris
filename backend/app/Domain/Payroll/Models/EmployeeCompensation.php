<?php

namespace App\Domain\Payroll\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeCompensation extends Model
{
    use BelongsToCompany;

    // "compensation" is uncountable to the inflector, so pin the table name.
    protected $table = 'employee_compensations';

    protected $fillable = [
        'company_id', 'employee_id', 'basic_monthly', 'allowance_monthly',
        'effective_from', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'basic_monthly' => 'decimal:2',
            'allowance_monthly' => 'decimal:2',
            'effective_from' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
