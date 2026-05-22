<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeEmploymentHistory;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\EmploymentHistoryRequest;
use App\Http\Resources\Employees\EmploymentHistoryResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class EmploymentHistoryController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return EmploymentHistoryResource::collection(
            $employee->employmentHistory()->orderByDesc('from_date')->get(),
        );
    }

    public function store(EmploymentHistoryRequest $request, Employee $employee): JsonResponse
    {
        $entry = $employee->employmentHistory()->create($request->validated());

        return (new EmploymentHistoryResource($entry))->response()->setStatusCode(201);
    }

    public function show(Request $request, Employee $employee, EmployeeEmploymentHistory $employmentHistory): EmploymentHistoryResource
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return new EmploymentHistoryResource($employmentHistory);
    }

    public function update(EmploymentHistoryRequest $request, Employee $employee, EmployeeEmploymentHistory $employmentHistory): EmploymentHistoryResource
    {
        $employmentHistory->update($request->validated());

        return new EmploymentHistoryResource($employmentHistory);
    }

    public function destroy(Request $request, Employee $employee, EmployeeEmploymentHistory $employmentHistory): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $employmentHistory->delete();

        return response()->json(['message' => 'Employment history entry removed.']);
    }
}
