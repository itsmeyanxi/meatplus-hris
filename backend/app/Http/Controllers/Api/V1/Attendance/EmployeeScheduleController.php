<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\EmployeeSchedule;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\EmployeeScheduleAssignmentRequest;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeScheduleController extends Controller
{
    public function __construct(private readonly DtrComputer $dtr) {}

    /**
     * Recompute the DTR across an assignment's date range so a schedule change
     * takes effect immediately. Without this, a retroactive or current change only
     * shows after the nightly SyncDtr — which covers just the last few days, so
     * back-dated assignments never take effect at all. The computer never marks
     * today/future absent, so an open-ended "to" is safe. Failures never break the
     * assignment itself.
     */
    private function recomputeRange(Employee $employee, ?string $from, ?string $to): void
    {
        if (! $from) {
            return;
        }
        try {
            $end = $to ? CarbonImmutable::parse($to) : CarbonImmutable::today();
            $this->dtr->computeForEmployee(
                $employee,
                CarbonImmutable::parse($from)->subDay(),
                $end->addDay(),
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }

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
        $data = $request->validated();
        $from = \Illuminate\Support\Carbon::parse($data['effective_from']);

        // Only ONE schedule may be active at a time. Close (or drop) any currently
        // open assignment before adding the new one, so schedules never overlap —
        // otherwise the DTR engine has two "current" schedules to choose from.
        foreach ($employee->scheduleAssignments()->whereNull('effective_to')->get() as $open) {
            if ($open->effective_from && \Illuminate\Support\Carbon::parse($open->effective_from)->gte($from)) {
                $open->delete(); // it started on/after the new one — it never took effect
            } else {
                $open->update(['effective_to' => $from->copy()->subDay()->toDateString()]);
            }
        }

        $assignment = $employee->scheduleAssignments()->create($data);
        $assignment->load('workSchedule:id,code,name');

        // Make the new schedule take effect now, across its whole range.
        $this->recomputeRange($employee, $assignment->effective_from?->toDateString(), $assignment->effective_to?->toDateString());

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

        $from = $schedule->effective_from?->toDateString();
        $to = $schedule->effective_to?->toDateString();
        $schedule->delete();

        // Removing a schedule must recompute too, else its old absences/lates linger.
        $this->recomputeRange($employee, $from, $to);

        return response()->json(['message' => 'Schedule assignment removed.']);
    }
}
