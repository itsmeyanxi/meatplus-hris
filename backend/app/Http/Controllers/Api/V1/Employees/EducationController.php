<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeEducation;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\EducationRequest;
use App\Http\Resources\Employees\EducationResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class EducationController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return EducationResource::collection(
            $employee->education()->orderByDesc('year_to')->orderByDesc('year_from')->get(),
        );
    }

    public function store(EducationRequest $request, Employee $employee): JsonResponse
    {
        $education = $employee->education()->create($request->validated());

        return (new EducationResource($education))->response()->setStatusCode(201);
    }

    public function show(Request $request, Employee $employee, EmployeeEducation $education): EducationResource
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return new EducationResource($education);
    }

    public function update(EducationRequest $request, Employee $employee, EmployeeEducation $education): EducationResource
    {
        $education->update($request->validated());

        return new EducationResource($education);
    }

    public function destroy(Request $request, Employee $employee, EmployeeEducation $education): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $education->delete();

        return response()->json(['message' => 'Education entry removed.']);
    }
}
