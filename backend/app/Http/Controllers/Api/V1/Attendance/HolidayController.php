<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\Holiday;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\HolidayRequest;
use App\Http\Resources\Attendance\HolidayResource;
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

    public function store(HolidayRequest $request): JsonResponse
    {
        $holiday = Holiday::create($request->validated());

        return (new HolidayResource($holiday))->response()->setStatusCode(201);
    }

    public function show(Request $request, Holiday $holiday): HolidayResource
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        return new HolidayResource($holiday);
    }

    public function update(HolidayRequest $request, Holiday $holiday): HolidayResource
    {
        $holiday->update($request->validated());

        return new HolidayResource($holiday);
    }

    public function destroy(Request $request, Holiday $holiday): JsonResponse
    {
        abort_unless($request->user()->can('attendance.manage'), 403);

        $holiday->delete();

        return response()->json(['message' => 'Holiday removed.']);
    }
}
