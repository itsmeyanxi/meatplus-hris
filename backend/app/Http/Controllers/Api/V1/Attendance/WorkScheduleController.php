<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\WorkSchedule;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\WorkScheduleRequest;
use App\Http\Resources\Attendance\WorkScheduleResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class WorkScheduleController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        return WorkScheduleResource::collection(
            WorkSchedule::with('days')->orderBy('name')->get(),
        );
    }

    public function store(WorkScheduleRequest $request): JsonResponse
    {
        $schedule = DB::transaction(function () use ($request) {
            $data = $request->validated();
            $days = $data['days'] ?? null;
            unset($data['days']);

            $schedule = WorkSchedule::create($data);
            if ($days) {
                foreach ($days as $day) {
                    $schedule->days()->create($day);
                }
            }

            return $schedule->load('days');
        });

        return (new WorkScheduleResource($schedule))->response()->setStatusCode(201);
    }

    public function show(Request $request, WorkSchedule $workSchedule): WorkScheduleResource
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        return new WorkScheduleResource($workSchedule->load('days'));
    }

    public function update(WorkScheduleRequest $request, WorkSchedule $workSchedule): WorkScheduleResource
    {
        $schedule = DB::transaction(function () use ($request, $workSchedule) {
            $data = $request->validated();
            $days = $data['days'] ?? null;
            unset($data['days']);

            $workSchedule->update($data);

            if ($days) {
                $workSchedule->days()->delete();
                foreach ($days as $day) {
                    $workSchedule->days()->create($day);
                }
            }

            return $workSchedule->load('days');
        });

        return new WorkScheduleResource($schedule);
    }

    public function destroy(Request $request, WorkSchedule $workSchedule): JsonResponse
    {
        abort_unless($request->user()->can('attendance.manage'), 403);

        $workSchedule->delete();

        return response()->json(['message' => 'Work schedule archived.']);
    }
}
