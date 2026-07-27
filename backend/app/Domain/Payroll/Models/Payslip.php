<?php

namespace App\Domain\Payroll\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payslip extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'payroll_run_id', 'company_id', 'employee_id',
        'days_worked', 'days_absent', 'late_minutes', 'overtime_minutes', 'night_diff_minutes',
        'basic_pay', 'overtime_pay', 'night_diff_pay', 'holiday_pay', 'rest_day_pay', 'allowance', 'gross_pay',
        'sss', 'philhealth', 'pagibig', 'withholding_tax',
        'absences_deduction', 'tardiness_deduction', 'total_deductions',
        'net_pay', 'breakdown',
    ];

    protected function casts(): array
    {
        return [
            'days_worked' => 'decimal:2',
            'basic_pay' => 'decimal:2',
            'overtime_pay' => 'decimal:2',
            'night_diff_pay' => 'decimal:2',
            'holiday_pay' => 'decimal:2',
            'rest_day_pay' => 'decimal:2',
            'allowance' => 'decimal:2',
            'gross_pay' => 'decimal:2',
            'sss' => 'decimal:2',
            'philhealth' => 'decimal:2',
            'pagibig' => 'decimal:2',
            'withholding_tax' => 'decimal:2',
            'absences_deduction' => 'decimal:2',
            'tardiness_deduction' => 'decimal:2',
            'total_deductions' => 'decimal:2',
            'net_pay' => 'decimal:2',
            'breakdown' => 'array',
        ];
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(PayrollRun::class, 'payroll_run_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
