<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\ShiftAdjustment;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ShiftAdjustmentController extends Controller
{
    public function index(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        $items = ShiftAdjustment::query()
            ->where('employee_id', $employee->id)
            ->orderByDesc('work_date')
            ->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request, Employee $employee, DtrComputer $computer): JsonResponse
    {
        abort_unless($request->user()->can('attendance.manage'), 403);

        $data = $request->validate([
            'work_date' => ['required', 'date'],
            'is_rest_day' => ['sometimes', 'boolean'],
            'time_in' => ['nullable', 'date_format:H:i'],
            'time_out' => ['nullable', 'date_format:H:i', 'after:time_in'],
            'break_minutes' => ['nullable', 'integer', 'min:0', 'max:480'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $isRest = (bool) ($data['is_rest_day'] ?? false);
        if (! $isRest && (empty($data['time_in']) || empty($data['time_out']))) {
            throw ValidationException::withMessages([
                'time_in' => 'A work shift needs both a time in and a time out (or mark it a rest day).',
            ]);
        }

        $adjustment = ShiftAdjustment::updateOrCreate(
            ['employee_id' => $employee->id, 'work_date' => $data['work_date']],
            [
                'company_id' => $employee->company_id,
                'is_rest_day' => $isRest,
                'time_in' => $isRest ? null : $data['time_in'],
                'time_out' => $isRest ? null : $data['time_out'],
                'break_minutes' => $data['break_minutes'] ?? 60,
                'reason' => $data['reason'] ?? null,
                'created_by_user_id' => $request->user()->id,
            ],
        );

        // Re-run the DTR engine for just that day so the change takes effect.
        $day = CarbonImmutable::parse($data['work_date']);
        $computer->computeForEmployee($employee, $day, $day);

        return response()->json(['data' => $adjustment], 201);
    }

    public function destroy(Request $request, Employee $employee, ShiftAdjustment $shiftAdjustment, DtrComputer $computer): JsonResponse
    {
        abort_unless($request->user()->can('attendance.manage'), 403);
        abort_unless($shiftAdjustment->employee_id === $employee->id, 404);

        $day = CarbonImmutable::parse($shiftAdjustment->work_date->toDateString());
        $shiftAdjustment->delete();

        // Recompute the day so it reverts to the standard schedule.
        $computer->computeForEmployee($employee, $day, $day);

        return response()->json(['message' => 'Shift adjustment removed.']);
    }
}
