<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\Holiday;
use App\Domain\Attendance\Services\DtrComputer;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\HolidayRequest;
use App\Http\Resources\Attendance\HolidayResource;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class HolidayController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        $q = Holiday::query();
        if ($from = $request->query('from')) {
            $q->where('holiday_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('holiday_date', '<=', $to);
        }

        return HolidayResource::collection($q->orderBy('holiday_date')->get());
    }

    public function store(HolidayRequest $request, DtrComputer $computer): JsonResponse
    {
        $holiday = Holiday::create($request->validated());

        // Auto-add to every applicable employee's calendar.
        $computer->applyHolidayToEmployees($holiday);

        return (new HolidayResource($holiday))->response()->setStatusCode(201);
    }

    public function show(Request $request, Holiday $holiday): HolidayResource
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        return new HolidayResource($holiday);
    }

    public function update(HolidayRequest $request, Holiday $holiday, DtrComputer $computer): HolidayResource
    {
        $originalDate = $holiday->holiday_date->toDateString();

        $holiday->update($request->validated());
        $holiday->refresh();

        // Propagate the edit to employee calendars.
        $computer->applyHolidayToEmployees($holiday);

        // If the date moved, clear the stale marker on the old date.
        if ($holiday->holiday_date->toDateString() !== $originalDate) {
            $computer->clearHolidayOnDate(
                CarbonImmutable::parse($originalDate),
                $holiday->company_id,
                $holiday->applicable_branch_id,
            );
        }

        return new HolidayResource($holiday);
    }

    public function destroy(Request $request, Holiday $holiday, DtrComputer $computer): JsonResponse
    {
        abort_unless($request->user()->can('attendance.manage'), 403);

        $date = $holiday->holiday_date->toDateString();
        $companyId = $holiday->company_id;
        $branchId = $holiday->applicable_branch_id;

        $holiday->delete();

        // Remove it from employee calendars on that date.
        $computer->clearHolidayOnDate(CarbonImmutable::parse($date), $companyId, $branchId);

        return response()->json(['message' => 'Holiday removed.']);
    }
}
