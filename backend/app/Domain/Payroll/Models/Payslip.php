<?php

namespace App\Domain\Payroll\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Domain\Payroll\Services\StatutoryCalculator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payslip extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'payroll_run_id', 'company_id', 'employee_id',
        'days_worked', 'days_absent', 'late_minutes', 'overtime_minutes', 'night_diff_minutes',
        'basic_pay', 'overtime_pay', 'night_diff_pay', 'holiday_pay', 'rest_day_pay', 'other_earnings', 'allowance', 'de_minimis', 'gross_pay',
        'sss', 'philhealth', 'pagibig', 'withholding_tax',
        'absences_deduction', 'tardiness_deduction', 'loans_deduction', 'other_deductions', 'total_deductions',
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
            'other_earnings' => 'decimal:2',
            'loans_deduction' => 'decimal:2',
            'other_deductions' => 'decimal:2',
            'allowance' => 'decimal:2',
            'de_minimis' => 'decimal:2',
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

    /**
     * The SSS deduction split into its two funds (RA 11199): Regular SS and the
     * Mandatory Provident Fund (MPF / WISP). regular + wisp always equals `sss`,
     * so no total changes. New runs store the split on the breakdown; older
     * payslips fall back to re-deriving the ratio from the employee's salary.
     *
     * @return array{regular: float, wisp: float}
     */
    public function sssParts(): array
    {
        $sss = (float) $this->sss;
        if ($sss <= 0) {
            return ['regular' => 0.0, 'wisp' => 0.0];
        }

        // Precise values recorded when the run was computed.
        $b = $this->breakdown ?? [];
        if (array_key_exists('sss_regular', $b)) {
            $reg = round((float) $b['sss_regular'], 2);

            return ['regular' => $reg, 'wisp' => round($sss - $reg, 2)];
        }

        // Legacy fallback: split the stored SSS in the Regular:WISP ratio the MSC implies.
        $monthly = (float) (EmployeeCompensation::query()
            ->where('employee_id', $this->employee_id)
            ->where('is_active', true)
            ->value('basic_monthly') ?? ($this->basic_pay * 2));
        $parts = app(StatutoryCalculator::class)->sssBreakdown($monthly);
        $total = (float) ($parts['ee_total'] ?? 0);
        if ($total <= 0) {
            return ['regular' => $sss, 'wisp' => 0.0];
        }
        $wisp = round($sss * (float) $parts['wisp_ee'] / $total, 2);

        return ['regular' => round($sss - $wisp, 2), 'wisp' => $wisp];
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
