<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\Payroll\Models\PayrollRun;
use App\Domain\Payroll\Models\PayslipAdjustment;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * One-off earnings/deductions on a specific payroll run. Editable only while the
 * run is still draft/computed — once approved or posted the figures are locked.
 */
class PayslipAdjustmentController extends Controller
{
    public function index(Request $request, PayrollRun $payrollRun): JsonResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);

        $rows = PayslipAdjustment::query()
            ->with('employee:id,employee_no,first_name,last_name')
            ->where('payroll_run_id', $payrollRun->id)
            ->latest()
            ->get()
            ->map(fn ($a) => $this->shape($a));

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request, PayrollRun $payrollRun): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $this->assertEditable($payrollRun);

        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'label' => ['required', 'string', 'max:120'],
            'kind' => ['required', 'in:earning,deduction'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:100000000'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);
        $data['company_id'] = $request->user()->active_company_id;
        $data['payroll_run_id'] = $payrollRun->id;

        $adj = PayslipAdjustment::create($data);

        return response()->json(['data' => $this->shape($adj->load('employee:id,employee_no,first_name,last_name'))], 201);
    }

    public function destroy(Request $request, PayslipAdjustment $adjustment): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $this->assertEditable($adjustment->run);
        $adjustment->delete();

        return response()->json(['message' => 'Adjustment removed.']);
    }

    private function assertEditable(?PayrollRun $run): void
    {
        if ($run && ! in_array($run->status, ['draft', 'computed'], true)) {
            throw ValidationException::withMessages([
                'status' => "Cannot change adjustments on a run that is {$run->status}. Recompute after editing.",
            ]);
        }
    }

    private function shape(PayslipAdjustment $a): array
    {
        return [
            'id' => $a->id,
            'employee' => $a->employee ? [
                'id' => $a->employee->id,
                'employee_no' => $a->employee->employee_no,
                'name' => $a->employee->full_name,
            ] : null,
            'employee_id' => $a->employee_id,
            'label' => $a->label,
            'kind' => $a->kind,
            'amount' => (float) $a->amount,
            'notes' => $a->notes,
        ];
    }
}
