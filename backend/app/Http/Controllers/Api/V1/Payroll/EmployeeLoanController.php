<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\Payroll\Models\EmployeeLoan;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Recurring loan / amortized deductions. Managed by payroll staff; the running
 * balance is drawn down automatically when a payroll run that deducted it is posted.
 */
class EmployeeLoanController extends Controller
{
    private const TYPES = ['sss_salary', 'sss_calamity', 'pagibig_mpl', 'pagibig_calamity', 'company', 'cash_advance', 'other'];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);

        $q = EmployeeLoan::query()
            ->with('employee:id,employee_no,first_name,last_name')
            ->latest();

        if ($eid = $request->query('employee_id')) {
            $q->where('employee_id', (int) $eid);
        }
        if ($request->boolean('active_only')) {
            $q->where('is_active', true)->where('outstanding_balance', '>', 0);
        }

        return response()->json(['data' => $q->limit(500)->get()->map(fn ($l) => $this->shape($l))]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $data = $this->validateLoan($request);

        // Balance defaults to the principal when not supplied.
        $data['company_id'] = $request->user()->active_company_id;
        $data['outstanding_balance'] = $data['outstanding_balance'] ?? $data['principal'] ?? 0;

        $loan = EmployeeLoan::create($data);

        return response()->json(['data' => $this->shape($loan->load('employee:id,employee_no,first_name,last_name'))], 201);
    }

    public function update(Request $request, EmployeeLoan $loan): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $data = $this->validateLoan($request, false);
        $loan->update($data);

        return response()->json(['data' => $this->shape($loan->fresh()->load('employee:id,employee_no,first_name,last_name'))]);
    }

    public function destroy(Request $request, EmployeeLoan $loan): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $loan->delete();

        return response()->json(['message' => 'Loan deleted.']);
    }

    private function validateLoan(Request $request, bool $creating = true): array
    {
        return $request->validate([
            'employee_id' => [$creating ? 'required' : 'sometimes', 'integer', 'exists:employees,id'],
            'type' => [$creating ? 'required' : 'sometimes', 'in:'.implode(',', self::TYPES)],
            'reference_no' => ['nullable', 'string', 'max:60'],
            'principal' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'amortization' => [$creating ? 'required' : 'sometimes', 'numeric', 'min:0', 'max:100000000'],
            'outstanding_balance' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'start_date' => ['nullable', 'date'],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function shape(EmployeeLoan $l): array
    {
        return [
            'id' => $l->id,
            'employee' => $l->employee ? [
                'id' => $l->employee->id,
                'employee_no' => $l->employee->employee_no,
                'name' => $l->employee->full_name,
            ] : null,
            'employee_id' => $l->employee_id,
            'type' => $l->type,
            'reference_no' => $l->reference_no,
            'principal' => (float) $l->principal,
            'amortization' => (float) $l->amortization,
            'outstanding_balance' => (float) $l->outstanding_balance,
            'start_date' => $l->start_date?->toDateString(),
            'is_active' => (bool) $l->is_active,
            'notes' => $l->notes,
        ];
    }
}
