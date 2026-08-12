<?php

namespace App\Domain\Payroll\Models;

use App\Domain\HRIS\Models\Employee;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeePayrollProfile extends Model
{
    protected $table = 'employee_payroll_profiles';

    protected $fillable = [
        'employee_id',
        'work_days_per_year', 'cost_center', 'is_rohq',
        'is_minimum_wage_earner', 'daily_allowance', 'de_minimis', 'fleet_card',
        'communication_allowance', 'transportation_allowance',
        'pay_group', 'consultant_percent_tax', 'work_hours_per_day', 'ot_computation_table',
        'sss_contribution_mode', 'sss_fixed_amount',
        'hdmf_contribution_mode', 'hdmf_additional',
        'philhealth_contribution_mode', 'philhealth_fixed_amount',
        'has_previous_employment',
        'prev_nontax_13th_month', 'prev_nontax_other_bonus', 'prev_nontax_salaries',
        'prev_13th_month', 'prev_other_bonus', 'prev_taxable_gross', 'prev_tax_withheld',
        'prev_government_deductions', 'prev_de_minimis', 'prev_taxable_compensation',
        'prev_monetized_leave',
    ];

    protected function casts(): array
    {
        return [
            'work_days_per_year' => 'integer',
            'is_rohq' => 'boolean',
            'is_minimum_wage_earner' => 'boolean',
            'has_previous_employment' => 'boolean',
            'daily_allowance' => 'decimal:2',
            'de_minimis' => 'decimal:2',
            'fleet_card' => 'decimal:2',
            'communication_allowance' => 'decimal:2',
            'transportation_allowance' => 'decimal:2',
            'consultant_percent_tax' => 'decimal:2',
            'work_hours_per_day' => 'decimal:2',
            'sss_fixed_amount' => 'decimal:2',
            'hdmf_additional' => 'decimal:2',
            'philhealth_fixed_amount' => 'decimal:2',
            'prev_nontax_13th_month' => 'decimal:2',
            'prev_nontax_other_bonus' => 'decimal:2',
            'prev_nontax_salaries' => 'decimal:2',
            'prev_13th_month' => 'decimal:2',
            'prev_other_bonus' => 'decimal:2',
            'prev_taxable_gross' => 'decimal:2',
            'prev_tax_withheld' => 'decimal:2',
            'prev_government_deductions' => 'decimal:2',
            'prev_de_minimis' => 'decimal:2',
            'prev_taxable_compensation' => 'decimal:2',
            'prev_monetized_leave' => 'decimal:2',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
