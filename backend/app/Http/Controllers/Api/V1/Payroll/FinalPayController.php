<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Leave\Models\LeaveBalance;
use App\Domain\Payroll\Models\FinalPay;
use App\Domain\Payroll\Models\Payslip;
use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinalPayController extends Controller
{
    private const SEPARATION_TYPES = [
        'resigned', 'terminated_just', 'terminated_authorized',
        'end_of_contract', 'retired', 'deceased',
    ];

    /** List all final pay records for the active company. */
    public function index(): JsonResponse
    {
        abort_unless(
            auth()->user()->can('leave.approve.any') || auth()->user()->hasRole('it_admin'),
            403
        );

        $rows = FinalPay::with('employee:id,employee_no,first_name,last_name')
            ->orderByDesc('last_working_day')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * Compute a draft breakdown without saving.
     * Returns pre-filled suggestions; HR may adjust before saving.
     * Daily rate = basic_monthly / 22 (standard Philippine working days).
     */
    public function compute(Request $request): JsonResponse
    {
        abort_unless(
            auth()->user()->can('leave.approve.any') || auth()->user()->hasRole('it_admin'),
            403
        );

        $data = $request->validate([
            'employee_id'             => 'required|integer|exists:employees,id',
            'last_working_day'        => 'required|date',
            'separation_type'         => 'required|string|in:' . implode(',', self::SEPARATION_TYPES),
            'days_worked_last_period' => 'required|integer|min:0|max:31',
        ]);

        $employee = Employee::with('compensation')->findOrFail($data['employee_id']);
        $lastDay  = Carbon::parse($data['last_working_day']);

        $basicMonthly = (float) ($employee->compensation?->basic_monthly ?? 0);
        $dailyRate    = $basicMonthly > 0 ? round($basicMonthly / 22, 4) : 0;

        // Unpaid salary for last partial period
        $unpaidSalary = round($data['days_worked_last_period'] * $dailyRate, 2);

        // Suggested 13th month: YTD basic pay from payslips ÷ 12
        $yearStart          = $lastDay->copy()->startOfYear();
        $totalBasicThisYear = (float) Payslip::whereHas('payrollRun', fn ($q) =>
            $q->where('period_start', '>=', $yearStart->toDateString())
              ->where('period_end', '<=', $lastDay->toDateString())
        )->where('employee_id', $employee->id)->sum('basic_pay');
        $suggested13th = round(($totalBasicThisYear + $unpaidSalary) / 12, 2);

        // Leave balances — return one item per leave type (HR sees each type separately)
        $leaveBalances = LeaveBalance::where('employee_id', $employee->id)
            ->where('year', $lastDay->year)
            ->where(fn ($q) => $q->where('opening_balance', '>', 0)
                ->orWhere('accrued', '>', 0)
                ->orWhere('granted_adhoc', '>', 0)
            )
            ->with('leaveType:id,name,code,is_paid,is_convertible_to_cash')
            ->get();

        $leaveItems = $leaveBalances
            ->filter(fn ($b) => $b->leaveType && $b->leaveType->is_convertible_to_cash && max(0, (float) $b->current_balance) > 0)
            ->map(fn ($b) => [
                'label'  => $b->leaveType->code,    // e.g. "SIL", "VL"
                'name'   => $b->leaveType->name,
                'days'   => round(max(0, (float) $b->current_balance), 2),
                'amount' => round(max(0, (float) $b->current_balance) * $dailyRate, 2),
            ])
            ->values();

        // Separation pay (authorized cause: higher of 1 month OR ½ month × years)
        $yearsOfService = $employee->date_hired
            ? round(Carbon::parse($employee->date_hired)->diffInDays($lastDay) / 365, 2)
            : 0;

        $separationPay = 0;
        if (in_array($data['separation_type'], ['terminated_authorized', 'end_of_contract'])) {
            $halfMonthPerYear = ($basicMonthly / 2) * max(1, floor($yearsOfService));
            $separationPay    = round(max($basicMonthly, $halfMonthPerYear), 2);
        }

        return response()->json([
            'data' => [
                'employee' => [
                    'id'          => $employee->id,
                    'employee_no' => $employee->employee_no,
                    'full_name'   => $employee->full_name,
                    'date_hired'  => $employee->date_hired?->format('Y-m-d'),
                ],
                'basic_monthly'            => round($basicMonthly, 2),
                'daily_rate'               => $dailyRate,
                'days_worked_last_period'  => $data['days_worked_last_period'],
                'years_of_service'         => $yearsOfService,
                'unpaid_salary'            => $unpaidSalary,
                'suggested_13th_month'     => $suggested13th,
                'leave_items'              => $leaveItems,
                'separation_pay'           => $separationPay,
                'separation_type'          => $data['separation_type'],
                'last_working_day'         => $lastDay->toDateString(),
            ],
        ]);
    }

    /** Save the HR-adjusted final pay. */
    public function store(Request $request): JsonResponse
    {
        abort_unless(
            auth()->user()->can('leave.approve.any') || auth()->user()->hasRole('it_admin'),
            403
        );

        $data = $request->validate([
            'employee_id'              => 'required|integer|exists:employees,id',
            'last_working_day'         => 'required|date',
            'separation_type'          => 'required|string|in:' . implode(',', self::SEPARATION_TYPES),
            'basic_monthly'            => 'nullable|numeric|min:0',
            'daily_rate'               => 'nullable|numeric|min:0',
            'days_worked_last_period'  => 'nullable|integer|min:0|max:31',
            'years_of_service'         => 'nullable|numeric|min:0',
            // Earnings (legacy scalar fields — kept for compatibility, not required when breakdown is present)
            'unpaid_salary'            => 'nullable|numeric|min:0',
            'thirteenth_month_pay'     => 'nullable|numeric|min:0',
            'leave_conversion'         => 'nullable|numeric|min:0',
            'unused_leave_days'        => 'nullable|numeric|min:0',
            'separation_pay'           => 'nullable|numeric|min:0',
            'other_earnings'           => 'nullable|numeric|min:0',
            'other_earnings_note'      => 'nullable|string|max:255',
            // Structured breakdowns
            'earnings_breakdown'       => 'nullable|array',          // [{label, days?, amount}]
            'earnings_breakdown.*.label'  => 'required|string',
            'earnings_breakdown.*.amount' => 'required|numeric',
            'deductions_breakdown'     => 'nullable|array',          // [{label, amount}]
            'deductions_breakdown.*.label'  => 'required|string',
            'deductions_breakdown.*.amount' => 'required|numeric',
            // Legacy deduction fields (sum is split per breakdown)
            'sss_deduction'            => 'nullable|numeric|min:0',
            'philhealth_deduction'     => 'nullable|numeric|min:0',
            'pagibig_deduction'        => 'nullable|numeric|min:0',
            'tax_deduction'            => 'nullable|numeric|min:0',
            'other_deductions'         => 'nullable|numeric|min:0',
            'other_deductions_note'    => 'nullable|string|max:255',
            'notes'                    => 'nullable|string',
            'status'                   => 'nullable|string|in:draft,finalized',
        ]);

        // Compute totals from breakdowns
        $earningsBreakdown   = $data['earnings_breakdown'] ?? [];
        $deductionsBreakdown = $data['deductions_breakdown'] ?? [];

        $totalGross = collect($earningsBreakdown)->sum('amount');
        $totalDed   = collect($deductionsBreakdown)->sum('amount');

        $finalPay = FinalPay::create([
            'company_id'              => auth()->user()->active_company_id,
            'employee_id'             => $data['employee_id'],
            'computed_by_user_id'     => auth()->user()->id,
            'last_working_day'        => $data['last_working_day'],
            'separation_type'         => $data['separation_type'],
            'basic_monthly'           => $data['basic_monthly']           ?? 0,
            'daily_rate'              => $data['daily_rate']              ?? 0,
            'days_worked_last_period' => $data['days_worked_last_period'] ?? 0,
            'years_of_service'        => $data['years_of_service']        ?? 0,
            'unpaid_salary'           => $data['unpaid_salary']           ?? 0,
            'thirteenth_month_pay'    => $data['thirteenth_month_pay']    ?? 0,
            'unused_leave_days'       => $data['unused_leave_days']       ?? 0,
            'leave_conversion'        => $data['leave_conversion']        ?? 0,
            'separation_pay'          => $data['separation_pay']          ?? 0,
            'other_earnings'          => $data['other_earnings'] ?? 0,
            'other_earnings_note'     => $data['other_earnings_note'] ?? null,
            'sss_deduction'           => $data['sss_deduction'] ?? 0,
            'philhealth_deduction'    => $data['philhealth_deduction'] ?? 0,
            'pagibig_deduction'       => $data['pagibig_deduction'] ?? 0,
            'tax_deduction'           => $data['tax_deduction'] ?? 0,
            'other_deductions'        => $data['other_deductions'] ?? 0,
            'other_deductions_note'   => $data['other_deductions_note'] ?? null,
            'earnings_breakdown'      => $earningsBreakdown,
            'deductions_breakdown'    => $deductionsBreakdown,
            'total_gross'             => round($totalGross, 2),
            'total_deductions_amount' => round($totalDed, 2),
            'net_final_pay'           => round($totalGross - $totalDed, 2),
            'notes'                   => $data['notes'] ?? null,
            'status'                  => $data['status'] ?? 'draft',
        ]);

        return response()->json([
            'data' => $finalPay->load('employee:id,employee_no,first_name,last_name'),
        ], 201);
    }

    public function show(FinalPay $finalPay): JsonResponse
    {
        return response()->json(['data' => $finalPay->load([
            'employee:id,employee_no,first_name,last_name,date_hired',
            'computedBy:id,name',
        ])]);
    }

    public function update(Request $request, FinalPay $finalPay): JsonResponse
    {
        abort_unless(
            auth()->user()->can('leave.approve.any') || auth()->user()->hasRole('it_admin'),
            403
        );

        $data = $request->validate([
            'notes'  => 'nullable|string',
            'status' => 'nullable|string|in:draft,finalized',
        ]);

        $finalPay->update($data);

        return response()->json(['data' => $finalPay->fresh('employee:id,employee_no,first_name,last_name')]);
    }
}
