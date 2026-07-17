<?php

namespace App\Domain\Payroll\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class EmployeeCompensation extends Model
{
    use BelongsToCompany;
    use LogsActivity;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['basic_monthly', 'pay_type', 'daily_rate', 'allowance_monthly', 'effective_from', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('compensation');
    }

    // "compensation" is uncountable to the inflector, so pin the table name.
    protected $table = 'employee_compensations';

    protected $fillable = [
        'company_id', 'employee_id', 'basic_monthly', 'pay_type', 'daily_rate',
        'allowance_monthly', 'effective_from', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'basic_monthly' => 'decimal:2',
            'daily_rate' => 'decimal:4',
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
