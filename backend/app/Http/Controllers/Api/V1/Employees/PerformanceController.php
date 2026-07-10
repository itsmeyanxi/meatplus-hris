<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeePerformance;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\PerformanceRequest;
use App\Http\Resources\Employees\PerformanceResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PerformanceController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return PerformanceResource::collection(
            $employee->performanceReviews()->with('reviewer')->orderByDesc('review_period_end')->get(),
        );
    }

    public function store(PerformanceRequest $request, Employee $employee): JsonResponse
    {
        $review = $employee->performanceReviews()->create($request->validated());

        return (new PerformanceResource($review))->response()->setStatusCode(201);
    }

    public function show(Request $request, Employee $employee, EmployeePerformance $performance): PerformanceResource
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return new PerformanceResource($performance->load('reviewer'));
    }

    public function update(PerformanceRequest $request, Employee $employee, EmployeePerformance $performance): PerformanceResource
    {
        $performance->update($request->validated());

        return new PerformanceResource($performance);
    }

    public function destroy(Request $request, Employee $employee, EmployeePerformance $performance): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $performance->delete();

        return response()->json(['message' => 'Performance review removed.']);
    }
}
