<?php

namespace App\Http\Controllers\Api\V1\Me;

use App\Domain\HRIS\Models\EmployeeGovernmentId;
use App\Domain\Payroll\Models\Payslip;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * An employee's own payslips. Only released runs (approved or posted) are visible
 * — draft/computed figures are still being worked on and shouldn't be shown yet.
 */
class PayslipController extends Controller
{
    private const RELEASED = ['approved', 'posted'];

    public function index(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;
        if (! $employee) {
            return response()->json(['data' => []]);
        }

        $rows = Payslip::query()
            ->with('run:id,name,period_start,period_end,pay_date,status')
            ->where('employee_id', $employee->id)
            ->whereHas('run', fn ($q) => $q->whereIn('status', self::RELEASED))
            ->get()
            ->sortByDesc(fn ($p) => $p->run?->period_end)
            ->values()
            ->map(fn ($p) => [
                'id' => $p->id,
                'run' => [
                    'name' => $p->run?->name,
                    'period_start' => $p->run?->period_start?->toDateString(),
                    'period_end' => $p->run?->period_end?->toDateString(),
                    'pay_date' => $p->run?->pay_date?->toDateString(),
                    'status' => $p->run?->status,
                ],
                'gross_pay' => (float) $p->gross_pay,
                'total_deductions' => (float) $p->total_deductions,
                'net_pay' => (float) $p->net_pay,
            ]);

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, Payslip $payslip): JsonResponse
    {
        $employee = $request->user()->employee;
        abort_unless($employee && $payslip->employee_id === $employee->id, 403);
        $payslip->load('run:id,name,period_start,period_end,pay_date,status', 'employee:id,employee_no,first_name,last_name,middle_name,department_id,position_id', 'employee.department:id,name', 'employee.position:id,title', 'company:id,legal_name,trade_name,code,address_line1,address_line2,city,province');
        abort_unless(in_array($payslip->run?->status, self::RELEASED, true), 403, 'This payslip has not been released yet.');

        return response()->json(['data' => $this->shape($payslip)]);
    }

    /** Human labels for loan types, matching the official payslip wording. */
    private const LOAN_LABELS = [
        'sss_salary' => 'SSS Salary Loan',
        'sss_calamity' => 'SSS Calamity Loan',
        'pagibig_mpl' => 'HDMF Salary Loan',
        'pagibig_calamity' => 'HDMF Calamity Loan',
        'company' => 'Company Loan',
        'cash_advance' => 'Employee Cash Advances',
        'other' => 'Other Loan',
    ];

    private function shape(Payslip $p): array
    {
        $c = $p->company;
        $address = trim(implode(', ', array_filter([$c?->address_line1, $c?->address_line2, $c?->city, $c?->province])));
        $gov = EmployeeGovernmentId::query()->where('employee_id', $p->employee_id)->first();

        // ── Compensation column ──────────────────────────────────────────────
        $compensation = [['label' => 'BASIC', 'amount' => (float) $p->basic_pay]];
        $add = function (array &$col, string $label, float $amount) {
            if (abs($amount) > 0.001) {
                $col[] = ['label' => $label, 'amount' => $amount];
            }
        };
        $add($compensation, 'DE MINIMIS BENEFITS', (float) $p->de_minimis);
        $add($compensation, 'MEAL ALLOWANCE', (float) $p->daily_allowance);
        $add($compensation, 'Non-Taxable Allowance', (float) $p->allowance);
        $add($compensation, 'OVERTIME ADJUSTMENT', (float) $p->overtime_pay);
        $add($compensation, 'HOLIDAY PAY', (float) $p->holiday_pay);
        $add($compensation, 'NIGHT DIFFERENTIAL', (float) $p->night_diff_pay);
        $add($compensation, 'REST DAY PAY', (float) $p->rest_day_pay);
        $add($compensation, 'OTHER EARNINGS', (float) $p->other_earnings);

        // ── Deductions column ────────────────────────────────────────────────
        $deductions = [
            ['label' => 'LATE/UNDERTIME', 'note' => "({$p->late_minutes}m)", 'amount' => (float) $p->tardiness_deduction],
            ['label' => 'ABSENCES', 'note' => '('.rtrim(rtrim(number_format((float) $p->days_absent, 2), '0'), '.').'d)', 'amount' => (float) $p->absences_deduction],
        ];
        // Loan lines from the payslip breakdown, labelled by type.
        foreach ($p->breakdown['loans'] ?? [] as $ln) {
            $deductions[] = ['label' => self::LOAN_LABELS[$ln['type']] ?? 'Loan', 'amount' => (float) ($ln['amount'] ?? 0)];
        }
        // One-off deduction adjustments.
        foreach ($p->breakdown['adjustments'] ?? [] as $adj) {
            if (($adj['kind'] ?? '') === 'deduction') {
                $deductions[] = ['label' => $adj['label'] ?? 'Adjustment', 'amount' => (float) ($adj['amount'] ?? 0)];
            }
        }
        // SSS splits into the Regular SS fund and the MPF/WISP fund (RA 11199).
        $sssParts = $p->sssParts();
        $deductions[] = ['label' => 'SSS', 'amount' => $sssParts['regular']];
        if ($sssParts['wisp'] > 0.001) {
            $deductions[] = ['label' => 'SSS MPF (WISP)', 'amount' => $sssParts['wisp']];
        }
        $deductions[] = ['label' => 'PHILHEALTH', 'amount' => (float) $p->philhealth];
        $deductions[] = ['label' => 'HDMF', 'amount' => (float) $p->pagibig];
        $deductions[] = ['label' => 'TAX', 'amount' => (float) $p->withholding_tax];

        return [
            'id' => $p->id,
            'company' => [
                'name' => $c?->legal_name ?: $c?->trade_name ?: $c?->code,
                'address' => $address,
            ],
            'employee' => [
                'employee_no' => $p->employee?->employee_no,
                'name' => $p->employee?->full_name,
                'department' => $p->employee?->department?->name,
                'position' => $p->employee?->position?->title,
                'tin' => $gov?->tin,
                'sss_no' => $gov?->sss_no,
                'philhealth_no' => $gov?->philhealth_no,
                'hdmf_no' => $gov?->pagibig_no,
            ],
            'payroll_date' => $p->run?->pay_date?->format('j F Y'),
            'date_covered' => $p->run?->period_start?->format('n/j/Y').' - '.$p->run?->period_end?->format('n/j/Y'),
            'compensation' => $compensation,
            'deductions' => $deductions,
            'ytd' => $this->yearToDate($p),
            'total_compensation' => (float) $p->gross_pay,
            'total_deductions' => (float) $p->total_deductions,
            'net_pay' => (float) $p->net_pay,
        ];
    }

    /** Cumulative figures for the payslip's year, across this employee's released runs. */
    private function yearToDate(Payslip $p): array
    {
        $year = (int) ($p->run?->period_end?->year ?? now()->year);
        $slips = Payslip::query()
            ->where('employee_id', $p->employee_id)
            ->whereHas('run', fn ($q) => $q->whereIn('status', self::RELEASED)->whereYear('period_end', $year))
            ->get();

        $sum = fn (string $col) => (float) $slips->sum(fn ($s) => (float) $s->$col);
        $grossIncome = $sum('gross_pay');
        $nonTaxable = $sum('allowance'); // allowances treated as non-taxable

        return [
            'taxable_gross' => round($grossIncome - $nonTaxable, 2),
            'tax' => round($sum('withholding_tax'), 2),
            'sss' => round($sum('sss'), 2),
            'phic' => round($sum('philhealth'), 2),
            'hdmf' => round($sum('pagibig'), 2),
            'gross_income' => round($grossIncome, 2),
            'non_taxable' => round($nonTaxable, 2),
        ];
    }
}
