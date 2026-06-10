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
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        $q = DailyTimeRecord::query()->orderBy('work_date');

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

        return DailyTimeRecordResource::collection($q->limit(500)->get());
    }

    /**
     * Self-service: the authenticated user's own daily time records for a date range.
     * No attendance.view needed — scoped strictly to their linked employee record.
     */
    public function mine(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;
        abort_unless($employee, 403, 'Your account is not linked to an employee record.');

        $q = DailyTimeRecord::query()
            ->where('employee_id', $employee->id)
            ->orderBy('work_date');

        if ($from = $request->query('from')) {
            $q->where('work_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('work_date', '<=', $to);
        }

        $records = $q->limit(400)->get();

        $summary = ['present' => 0, 'late' => 0, 'absent' => 0, 'leave' => 0, 'holiday' => 0, 'rest_day' => 0];
        foreach ($records as $r) {
            $status = $this->classify($r);
            if (array_key_exists($status, $summary)) {
                $summary[$status]++;
            }
        }

        return response()->json([
            'data' => DailyTimeRecordResource::collection($records),
            'summary' => $summary,
        ]);
    }

    /** Mirrors DailyTimeRecordResource::dayStatus for summary counts. */
    private function classify(DailyTimeRecord $r): string
    {
        if ($r->is_on_leave) {
            return 'leave';
        }
        if ($r->is_absent) {
            return 'absent';
        }
        if ($r->holiday_type && (float) $r->hours_worked === 0.0) {
            return 'holiday';
        }
        if ($r->is_rest_day && (float) $r->hours_worked === 0.0) {
            return 'rest_day';
        }
        if ($r->late_minutes > 0) {
            return 'late';
        }
        if ((float) $r->hours_worked > 0 || $r->actual_in) {
            return 'present';
        }

        return 'no_record';
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
