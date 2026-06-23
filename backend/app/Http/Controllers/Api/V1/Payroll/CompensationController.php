<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\CompensationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

    /** Set / update an employee's monthly compensation. */
    public function store(CompensationRequest $request): JsonResponse
    {
        $data = $request->validated();

        $comp = EmployeeCompensation::updateOrCreate(
            ['employee_id' => $data['employee_id']],
            [
                'company_id' => $request->user()->active_company_id,
                'basic_monthly' => $data['basic_monthly'],
                'allowance_monthly' => $data['allowance_monthly'] ?? 0,
                'effective_from' => $data['effective_from'] ?? null,
                'is_active' => true,
            ],
        );

        return response()->json([
            'message' => 'Compensation saved.',
            'data' => [
                'employee_id' => $comp->employee_id,
                'basic_monthly' => $comp->basic_monthly,
                'allowance_monthly' => $comp->allowance_monthly,
            ],
        ]);
    }
}
