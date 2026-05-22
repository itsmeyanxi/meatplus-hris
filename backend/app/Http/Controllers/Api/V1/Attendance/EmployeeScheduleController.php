<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\EmployeeSchedule;
use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\EmployeeScheduleAssignmentRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeScheduleController extends Controller
{
    public function index(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        return response()->json([
            'data' => $employee->scheduleAssignments()
                ->with('workSchedule:id,code,name')
                ->orderBy('effective_from', 'desc')
                ->get()
                ->map(fn (EmployeeSchedule $a) => [
                    'id' => $a->id,
                    'work_schedule' => [
                        'id' => $a->workSchedule->id,
                        'code' => $a->workSchedule->code,
                        'name' => $a->workSchedule->name,
                    ],
                    'effective_from' => $a->effective_from?->toDateString(),
                    'effective_to' => $a->effective_to?->toDateString(),
                ]),
        ]);
    }

    public function store(EmployeeScheduleAssignmentRequest $request, Employee $employee): JsonResponse
    {
        $assignment = $employee->scheduleAssignments()->create($request->validated());
        $assignment->load('workSchedule:id,code,name');

        return response()->json([
            'data' => [
                'id' => $assignment->id,
                'work_schedule' => [
                    'id' => $assignment->workSchedule->id,
                    'code' => $assignment->workSchedule->code,
                    'name' => $assignment->workSchedule->name,
                ],
                'effective_from' => $assignment->effective_from?->toDateString(),
                'effective_to' => $assignment->effective_to?->toDateString(),
            ],
        ], 201);
    }

    public function destroy(Request $request, Employee $employee, EmployeeSchedule $schedule): JsonResponse
    {
        abort_unless($request->user()->can('attendance.manage'), 403);
        abort_unless($schedule->employee_id === $employee->id, 404);

        $schedule->delete();

        return response()->json(['message' => 'Schedule assignment removed.']);
    }
}
