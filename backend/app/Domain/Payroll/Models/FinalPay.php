<?php

namespace App\Domain\Payroll\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinalPay extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'employee_id', 'computed_by_user_id',
        'last_working_day', 'separation_type',
        'basic_monthly', 'daily_rate', 'days_worked_last_period', 'years_of_service',
        'unpaid_salary', 'thirteenth_month_pay', 'unused_leave_days', 'leave_conversion',
        'separation_pay', 'other_earnings', 'other_earnings_note',
        'sss_deduction', 'philhealth_deduction', 'pagibig_deduction',
        'tax_deduction', 'other_deductions', 'other_deductions_note',
        'total_gross', 'total_deductions_amount', 'net_final_pay',
        'notes', 'status',
        'earnings_breakdown', 'deductions_breakdown',
    ];

    protected function casts(): array
    {
        return [
            'last_working_day'         => 'date',
            'basic_monthly'            => 'decimal:2',
            'daily_rate'               => 'decimal:4',
            'years_of_service'         => 'decimal:2',
            'unpaid_salary'            => 'decimal:2',
            'thirteenth_month_pay'     => 'decimal:2',
            'unused_leave_days'        => 'decimal:2',
            'leave_conversion'         => 'decimal:2',
            'separation_pay'           => 'decimal:2',
            'other_earnings'           => 'decimal:2',
            'sss_deduction'            => 'decimal:2',
            'philhealth_deduction'     => 'decimal:2',
            'pagibig_deduction'        => 'decimal:2',
            'tax_deduction'            => 'decimal:2',
            'other_deductions'         => 'decimal:2',
            'total_gross'              => 'decimal:2',
            'total_deductions_amount'  => 'decimal:2',
            'net_final_pay'            => 'decimal:2',
            'earnings_breakdown'       => 'array',
            'deductions_breakdown'     => 'array',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function computedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'computed_by_user_id');
    }
}
