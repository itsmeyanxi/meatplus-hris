<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeBenefit;
use App\Http\Controllers\Controller;
use App\Http\Resources\Employees\BenefitResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BenefitController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return BenefitResource::collection(
            $employee->benefits()->orderByDesc('is_active')->orderByDesc('effective_date')->get(),
        );
    }

    public function store(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $benefit = $employee->benefits()->create($this->validated($request));

        return (new BenefitResource($benefit))->response()->setStatusCode(201);
    }

    public function update(Request $request, Employee $employee, EmployeeBenefit $benefit): BenefitResource
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($benefit->employee_id === $employee->id, 404);

        $benefit->update($this->validated($request, partial: true));

        return new BenefitResource($benefit);
    }

    public function destroy(Request $request, Employee $employee, EmployeeBenefit $benefit): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($benefit->employee_id === $employee->id, 404);

        $benefit->delete();

        return response()->json(['message' => 'Benefit removed.']);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'type' => [$req, 'string', 'max:80'],
            'is_active' => ['sometimes', 'boolean'],
            'enrollment_date' => ['nullable', 'date'],
            // Cover starts on or after the employee enrolled.
            'effective_date' => ['nullable', 'date', 'after_or_equal:enrollment_date'],
            'plan' => ['nullable', 'string', 'max:150'],
            'beneficiary' => ['nullable', 'string', 'max:150'],
            'payment_type' => ['nullable', 'string', 'in:employer,employee,shared'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
    }
}
