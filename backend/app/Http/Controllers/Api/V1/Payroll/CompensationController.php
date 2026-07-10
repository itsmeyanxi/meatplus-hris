<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\CompensationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CompensationController extends Controller
{
    /** List employees with their current monthly compensation (for the payroll setup grid). */
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('compensation.view') || $request->user()->can('payroll.view'), 403);

        $employees = Employee::query()
            ->where('is_active', true)
            ->with(['department:id,name', 'compensation'])
            ->orderBy('last_name')->orderBy('first_name')
            ->get()
            ->map(fn (Employee $e) => [
                'employee_id' => $e->id,
                'employee_no' => $e->employee_no,
                'name' => $e->full_name,
                'department' => $e->department?->name,
                'basic_monthly' => $e->compensation?->basic_monthly,
                'allowance_monthly' => $e->compensation?->allowance_monthly,
                'has_compensation' => (bool) $e->compensation,
            ]);

        return response()->json(['data' => $employees]);
    }

    /**
     * Record a new salary for an employee.
     *
     * This used to updateOrCreate on employee_id, overwriting the previous figure —
     * so there was never any history, despite the effective_from / is_active columns.
     * It now closes the outgoing record and appends a new one, which is what a salary
     * history means and what Employee::compensation() selects from.
     */
    public function store(CompensationRequest $request): JsonResponse
    {
        $data = $request->validated();

        $comp = DB::transaction(function () use ($request, $data) {
            EmployeeCompensation::query()
                ->where('employee_id', $data['employee_id'])
                ->where('is_active', true)
                ->update(['is_active' => false]);

            return EmployeeCompensation::create([
                'employee_id' => $data['employee_id'],
                'company_id' => $request->user()->active_company_id,
                'basic_monthly' => $data['basic_monthly'],
                'allowance_monthly' => $data['allowance_monthly'] ?? 0,
                'effective_from' => $data['effective_from'] ?? null,
                'is_active' => true,
            ]);
        });

        return response()->json([
            'message' => 'Compensation saved.',
            'data' => [
                'employee_id' => $comp->employee_id,
                'basic_monthly' => $comp->basic_monthly,
                'allowance_monthly' => $comp->allowance_monthly,
            ],
        ]);
    }

    /** Salary history for one employee, newest first. */
    public function history(Request $request, Employee $employee): JsonResponse
    {
        abort_unless(
            $request->user()->can('compensation.view') || $request->user()->can('payroll.view'),
            403,
        );

        return response()->json([
            'data' => $employee->compensations()->get()->map(fn (EmployeeCompensation $c) => [
                'id' => $c->id,
                'basic_monthly' => $c->basic_monthly,
                'allowance_monthly' => $c->allowance_monthly,
                'effective_from' => $c->effective_from?->toDateString(),
                'is_active' => $c->is_active,
            ]),
        ]);
    }

    public function destroy(Request $request, Employee $employee, EmployeeCompensation $compensation): JsonResponse
    {
        abort_unless($request->user()->can('compensation.manage'), 403);
        abort_unless($compensation->employee_id === $employee->id, 404);

        $wasActive = $compensation->is_active;
        $compensation->delete();

        // Never leave an employee without a current salary while history remains.
        if ($wasActive && ($next = $employee->compensations()->first())) {
            $next->update(['is_active' => true]);
        }

        return response()->json(['message' => 'Salary record removed.']);
    }
}
