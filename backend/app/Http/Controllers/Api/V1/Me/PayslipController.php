<?php

namespace App\Http\Controllers\Api\V1\Me;

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
        $payslip->load('run:id,name,period_start,period_end,pay_date,status', 'employee:id,employee_no,first_name,last_name,middle_name,department_id,position_id', 'employee.department:id,name', 'employee.position:id,title', 'company:id,legal_name,trade_name,code');
        abort_unless(in_array($payslip->run?->status, self::RELEASED, true), 403, 'This payslip has not been released yet.');

        return response()->json(['data' => $this->shape($payslip)]);
    }

    private function shape(Payslip $p): array
    {
        return [
            'id' => $p->id,
            'company' => [
                'name' => $p->company?->trade_name ?: $p->company?->legal_name ?: $p->company?->code,
            ],
            'employee' => [
                'employee_no' => $p->employee?->employee_no,
                'name' => $p->employee?->full_name,
                'department' => $p->employee?->department?->name,
                'position' => $p->employee?->position?->title,
            ],
            'run' => [
                'name' => $p->run?->name,
                'period_start' => $p->run?->period_start?->toDateString(),
                'period_end' => $p->run?->period_end?->toDateString(),
                'pay_date' => $p->run?->pay_date?->toDateString(),
            ],
            'attendance' => [
                'days_worked' => (float) $p->days_worked,
                'days_absent' => (int) $p->days_absent,
                'late_minutes' => (int) $p->late_minutes,
                'overtime_minutes' => (int) $p->overtime_minutes,
                'night_diff_minutes' => (int) $p->night_diff_minutes,
            ],
            'earnings' => [
                'basic_pay' => (float) $p->basic_pay,
                'overtime_pay' => (float) $p->overtime_pay,
                'night_diff_pay' => (float) $p->night_diff_pay,
                'holiday_pay' => (float) $p->holiday_pay,
                'rest_day_pay' => (float) $p->rest_day_pay,
                'allowance' => (float) $p->allowance,
                'other_earnings' => (float) $p->other_earnings,
                'gross_pay' => (float) $p->gross_pay,
            ],
            'deductions' => [
                'sss' => (float) $p->sss,
                'philhealth' => (float) $p->philhealth,
                'pagibig' => (float) $p->pagibig,
                'withholding_tax' => (float) $p->withholding_tax,
                'tardiness_deduction' => (float) $p->tardiness_deduction,
                'loans_deduction' => (float) $p->loans_deduction,
                'other_deductions' => (float) $p->other_deductions,
                'total_deductions' => (float) $p->total_deductions,
            ],
            'breakdown' => $p->breakdown,
            'net_pay' => (float) $p->net_pay,
        ];
    }
}
