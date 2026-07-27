<?php

namespace App\Domain\Payroll\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A one-off earning or deduction applied to a single employee in a single
 * payroll run (bonus, backpay, correction, uniform deduction, etc.). Read by
 * PayrollComputer when it (re)computes the run.
 */
class PayslipAdjustment extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'payroll_run_id', 'employee_id', 'label', 'kind', 'amount', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(PayrollRun::class, 'payroll_run_id');
    }
}
