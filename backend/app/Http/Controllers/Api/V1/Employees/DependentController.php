<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeDependent;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\DependentRequest;
use App\Http\Resources\Employees\DependentResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class DependentController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return DependentResource::collection(
            $employee->dependents()->orderBy('relationship')->orderBy('full_name')->get(),
        );
    }

    public function store(DependentRequest $request, Employee $employee): JsonResponse
    {
        $dependent = $employee->dependents()->create($request->validated());

        return (new DependentResource($dependent))->response()->setStatusCode(201);
    }

    public function show(Request $request, Employee $employee, EmployeeDependent $dependent): DependentResource
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return new DependentResource($dependent);
    }

    public function update(DependentRequest $request, Employee $employee, EmployeeDependent $dependent): DependentResource
    {
        $dependent->update($request->validated());

        return new DependentResource($dependent);
    }

    public function destroy(Request $request, Employee $employee, EmployeeDependent $dependent): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $dependent->delete();

        return response()->json(['message' => 'Dependent removed.']);
    }
}
