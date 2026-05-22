<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\ComputeDtrRequest;
use App\Http\Resources\Attendance\DailyTimeRecordResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class DailyTimeRecordController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        $q = DailyTimeRecord::query()->orderBy('work_date');

        if ($eid = $request->query('employee_id')) {
            $q->where('employee_id', $eid);
        }
        if ($from = $request->query('from')) {
            $q->where('work_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('work_date', '<=', $to);
        }

        return DailyTimeRecordResource::collection($q->limit(500)->get());
    }

    public function compute(ComputeDtrRequest $request, DtrComputer $computer): AnonymousResourceCollection
    {
        $employee = Employee::findOrFail($request->validated('employee_id'));

        $records = $computer->computeForEmployee(
            $employee,
            \Carbon\CarbonImmutable::parse($request->validated('from')),
            \Carbon\CarbonImmutable::parse($request->validated('to')),
        );

        return DailyTimeRecordResource::collection($records);
    }
}
