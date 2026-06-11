<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\Holiday;
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
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        $q = DailyTimeRecord::query();

        // HR (attendance.view.any) sees everyone; everyone else is locked to their own record.
        if ($user->can('attendance.view.any')) {
            if ($eid = $request->query('employee_id')) {
                $q->where('employee_id', $eid);
            }
        } else {
            $employee = $user->employee;
            abort_unless($employee, 403, 'Your account is not linked to an employee record.');
            $q->where('employee_id', $employee->id);
        }

        if ($from = $request->query('from')) {
            $q->where('work_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('work_date', '<=', $to);
        }

        // Cap on the most recent rows (DESC + limit), then present chronologically
        // so a wide range never silently drops the latest days.
        $records = $q->orderBy('work_date', 'desc')->limit(500)->get()
            ->sortBy('work_date')->values();

        return DailyTimeRecordResource::collection($records);
    }

    /**
     * Self-service: the authenticated user's own daily time records for a date range.
     * No attendance.view needed — scoped strictly to their linked employee record.
     */
    public function mine(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;
        abort_unless($employee, 403, 'Your account is not linked to an employee record.');

        $from = $request->query('from');
        $to = $request->query('to');

        // Order DESC so the row cap always keeps the most recent days (the calendar
        // cares about current/upcoming dates); a wide range never drops them.
        $q = DailyTimeRecord::query()
            ->where('employee_id', $employee->id)
            ->orderBy('work_date', 'desc');

        if ($from) {
            $q->where('work_date', '>=', $from);
        }
        if ($to) {
            $q->where('work_date', '<=', $to);
        }

        $records = $q->limit(800)->get();

        // Attach the holiday name (e.g. "Labor Day") to holiday rows so the
        // calendar can show which holiday it is, not just a generic label.
        $holidays = Holiday::query()
            ->where(function ($hq) use ($employee) {
                $hq->whereNull('company_id')->orWhere('company_id', $employee->company_id);
            })
            ->where(function ($hq) use ($employee) {
                $hq->whereNull('applicable_branch_id')->orWhere('applicable_branch_id', $employee->branch_id);
            })
            ->when($from, fn ($hq) => $hq->where('holiday_date', '>=', $from))
            ->when($to, fn ($hq) => $hq->where('holiday_date', '<=', $to))
            ->get()
            ->keyBy(fn (Holiday $h) => $h->holiday_date->toDateString());

        $summary = ['present' => 0, 'late' => 0, 'absent' => 0, 'leave' => 0, 'holiday' => 0, 'rest_day' => 0];
        foreach ($records as $r) {
            if ($r->holiday_type) {
                $r->holiday_name = $holidays->get($r->work_date->toDateString())?->name;
            }
            $status = $r->dayStatus();
            if (array_key_exists($status, $summary)) {
                $summary[$status]++;
            }
        }

        return response()->json([
            'data' => DailyTimeRecordResource::collection($records),
            'summary' => $summary,
        ]);
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
