<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeePerformanceGoal;
use App\Http\Controllers\Controller;
use App\Http\Resources\Employees\PerformanceGoalResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PerformanceGoalController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return PerformanceGoalResource::collection(
            $employee->performanceGoals()->orderBy('due_date')->get(),
        );
    }

    public function store(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $data = $request->validate([
            'goal' => ['required', 'string', 'max:500'],
            'due_date' => ['nullable', 'date'],
            'feedback' => ['nullable', 'string', 'max:2000'],
        ]);

        $goal = $employee->performanceGoals()->create($data);

        return (new PerformanceGoalResource($goal))->response()->setStatusCode(201);
    }

    public function update(Request $request, Employee $employee, EmployeePerformanceGoal $goal): PerformanceGoalResource
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($goal->employee_id === $employee->id, 404);

        $goal->update($request->validate([
            'goal' => ['sometimes', 'string', 'max:500'],
            'due_date' => ['nullable', 'date'],
            'feedback' => ['nullable', 'string', 'max:2000'],
        ]));

        return new PerformanceGoalResource($goal);
    }

    public function destroy(Request $request, Employee $employee, EmployeePerformanceGoal $goal): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($goal->employee_id === $employee->id, 404);

        $goal->delete();

        return response()->json(['message' => 'Goal removed.']);
    }
}
