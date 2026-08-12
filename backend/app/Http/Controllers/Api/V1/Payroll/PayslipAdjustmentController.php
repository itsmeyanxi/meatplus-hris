<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\Payroll\Models\PayrollRun;
use App\Domain\Payroll\Models\PayslipAdjustment;
use App\Domain\Payroll\Services\PayslipAdjustmentImportService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

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

    /**
     * Bulk-import adjustments onto this run from a CSV/XLSX (e.g. the Payrollpie
     * "One time adjustment worksheet"). Recompute the run afterwards to apply them.
     */
    public function import(Request $request, PayrollRun $payrollRun, PayslipAdjustmentImportService $service): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $this->assertEditable($payrollRun);
        $request->validate(['file' => ['required', 'file', 'max:5120']]);

        $file = $request->file('file');
        $head = @file_get_contents($file->getRealPath(), false, null, 0, 8) ?: '';
        $ext = str_starts_with($head, "PK\x03\x04") ? 'xlsx' : (str_starts_with($head, "\xD0\xCF\x11\xE0") ? null : 'csv');
        if ($ext === null) {
            return response()->json(['message' => 'Unsupported file. Upload a .csv or .xlsx.'], 422);
        }

        return response()->json($service->import($file->getRealPath(), $ext, $payrollRun, (int) $request->user()->active_company_id));
    }

    /** CSV template mirroring the Payrollpie one-time-adjustment worksheet. */
    public function importTemplate(Request $request, PayrollRun $payrollRun): StreamedResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);

        $header = ['STATUS', 'Employee ID', 'Employee Name', 'Adjustment Type', 'Adjustment Name', 'Adjustment Code', 'Adjustment Amount', 'Remarks', 'Apply Before Tax', 'Is Taxable'];
        $examples = [
            ['SAMPLE DATA', 'E0000001', 'Juan Dela Cruz', 'Allowance', 'Allowance', 'Allowance', '1,000.00', 'Allowance', 'Yes', 'Yes'],
            ['SAMPLE DATA', 'E0000002', 'Maria Santos', 'Overtime', 'OT — last cutoff', 'OT', '875.00', 'Unpaid OT carried over', 'Yes', 'Yes'],
            ['SAMPLE DATA', 'E0000003', 'Pedro Reyes', 'Deduction', 'Uniform', 'UNIFORM', '300.00', 'Company uniform', 'No', 'No'],
        ];

        return response()->streamDownload(function () use ($header, $examples) {
            $o = fopen('php://output', 'w');
            fputcsv($o, ['One-time adjustment worksheet — remove the SAMPLE rows, fill your own, then upload under Adjustments -> Import. Required: Employee ID + Adjustment Amount. Adjustment Type decides earning vs deduction (Allowance/Bonus/OT = earning; Deduction/Loan/Tardiness = deduction).']);
            fputcsv($o, $header);
            foreach ($examples as $ex) {
                fputcsv($o, $ex);
            }
            fclose($o);
        }, 'adjustments_import_template.csv', ['Content-Type' => 'text/csv']);
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
