<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Payroll\Models\EmployeePayItem;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * HR-defined recurring pay benefits/allowances per employee. Read needs
 * compensation.view; changes need compensation.manage. Confidential employees'
 * benefits are gated the same way their pay is.
 */
class EmployeePayItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('compensation.view') || $request->user()->can('payroll.view'), 403);
        $employeeId = (int) $request->query('employee_id');
        $employee = Employee::query()->findOrFail($employeeId);
        $this->assertCanSee($request, $employee);

        return response()->json(['data' => EmployeePayItem::query()
            ->where('employee_id', $employee->id)
            ->orderByDesc('is_active')->orderBy('label')
            ->get()
            ->map(fn ($i) => $this->shape($i))]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('compensation.manage'), 403);
        $data = $this->validated($request);
        $employee = Employee::query()->findOrFail($data['employee_id']);
        $this->assertCanSee($request, $employee);

        $item = EmployeePayItem::create([
            'company_id' => $request->user()->active_company_id,
            'employee_id' => $employee->id,
            'label' => $data['label'],
            'amount' => $data['amount'],
            'cadence' => $data['cadence'],
            'is_active' => $data['is_active'] ?? true,
            'notes' => $data['notes'] ?? null,
        ]);

        return response()->json(['data' => $this->shape($item)], 201);
    }

    public function update(Request $request, EmployeePayItem $payItem): JsonResponse
    {
        abort_unless($request->user()->can('compensation.manage'), 403);
        $this->assertCanSee($request, $payItem->employee);
        $data = $this->validated($request, false);
        $payItem->update($data);

        return response()->json(['data' => $this->shape($payItem->refresh())]);
    }

    public function destroy(Request $request, EmployeePayItem $payItem): JsonResponse
    {
        abort_unless($request->user()->can('compensation.manage'), 403);
        $this->assertCanSee($request, $payItem->employee);
        $payItem->delete();

        return response()->json(['message' => 'Benefit removed.']);
    }

    /** @return array<string,mixed> */
    private function validated(Request $request, bool $creating = true): array
    {
        return $request->validate([
            'employee_id' => [Rule::requiredIf($creating), 'integer', 'exists:employees,id'],
            'label' => [Rule::requiredIf($creating), 'string', 'max:100'],
            'amount' => [Rule::requiredIf($creating), 'numeric', 'min:0', 'max:99999999'],
            'cadence' => [Rule::requiredIf($creating), Rule::in(EmployeePayItem::CADENCES)],
            'is_active' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);
    }

    /** A confidential employee's benefits are only visible/editable to allowed viewers. */
    private function assertCanSee(Request $request, ?Employee $employee): void
    {
        abort_unless($employee, 404);
        $canConfi = $request->user()->can('employee.view.sensitive') || $request->user()->hasRole('admin');
        abort_if($employee->is_confidential && ! $canConfi, 403, 'You are not allowed to manage this employee\'s benefits.');
    }

    /** @return array<string,mixed> */
    private function shape(EmployeePayItem $i): array
    {
        return [
            'id' => $i->id,
            'employee_id' => $i->employee_id,
            'label' => $i->label,
            'amount' => (float) $i->amount,
            'cadence' => $i->cadence,
            'is_active' => (bool) $i->is_active,
            'notes' => $i->notes,
        ];
    }
}
