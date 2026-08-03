<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Services\AttendanceEventResolver;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\TimeLogRequest;
use App\Http\Resources\Attendance\TimeLogResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class TimeLogController extends Controller
{
    public function index(Request $request, AttendanceEventResolver $eventResolver): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        // employee.branch feeds the geofence verdict + site location in TimeLogResource;
        // device (and its branch) resolves the friendly terminal name and site;
        // employee.company is the last-resort location fallback.
        $q = TimeLog::query()
            ->with('employee.branch', 'employee.company', 'device.branch')
            ->orderByDesc('logged_at'); // newest punches first

        $employeeId = null;
        // HR (attendance.view.any) sees everyone; everyone else is locked to their own logs.
        if ($user->can('attendance.view.any')) {
            if ($eid = $request->query('employee_id')) {
                $q->where('employee_id', $eid);
                $employeeId = (int) $eid;
            }
        } else {
            $employee = $user->employee;
            abort_unless($employee, 403, 'Your account is not linked to an employee record.');
            $q->where('employee_id', $employee->id);
            $employeeId = $employee->id;
        }

        $from = $request->query('from');
        $to = $request->query('to');
        if ($from) {
            $q->where('logged_at', '>=', $from);
        }
        if ($to) {
            $q->where('logged_at', '<=', $to.' 23:59:59');
        }
        $device = $request->query('device_id');
        if ($device) {
            $q->where('device_id', $device);
        }
        if ($cid = $request->query('company_id')) {
            $q->where('company_id', $cid);
        }
        $dept = $request->query('department_id');
        if ($dept) {
            $q->whereHas('employee', fn ($e) => $e->where('department_id', $dept));
        }

        // OB / COA / OT events for the same scope. These have no device, so we omit
        // them when the caller is filtering to a specific terminal (punch-only intent).
        $events = $device
            ? []
            : $eventResolver->resolve($from, $to, $employeeId, $dept ? (int) $dept : null);

        return response()->json([
            'data' => TimeLogResource::collection($q->limit(500)->get()),
            'events' => $events,
        ]);
    }

    /**
     * Self-service: the authenticated user's own punch log for a date range.
     * No attendance.view needed — scoped strictly to their linked employee record,
     * mirroring my/daily-time-records. Powers the employee "My Time Logs" page.
     *
     * Also returns approved OB / COA / OT for the range as labelled events. Those
     * aren't hardware punches (OB is off-site, COA is a certified missed punch, OT
     * is approved extra hours), so a raw punch log would leave them invisible — we
     * surface them explicitly alongside the punches.
     */
    public function mine(Request $request, AttendanceEventResolver $events): JsonResponse
    {
        $employee = $request->user()->employee;
        abort_unless($employee, 403, 'Your account is not linked to an employee record.');

        $from = $request->query('from');
        $to = $request->query('to');

        $q = TimeLog::query()
            ->with('employee.branch', 'employee.company', 'device.branch')
            ->where('employee_id', $employee->id)
            ->orderByDesc('logged_at');

        if ($from) {
            $q->where('logged_at', '>=', $from);
        }
        if ($to) {
            $q->where('logged_at', '<=', $to.' 23:59:59');
        }

        $logs = $q->limit(500)->get();

        return response()->json([
            'data' => TimeLogResource::collection($logs),
            'events' => $events->resolve($from, $to, $employee->id),
        ]);
    }

    /**
     * Export the (filtered) punch log as CSV. Honours the same filters and the
     * company scope as index(); streamed in chunks so a large range stays memory-safe.
     */
    public function export(Request $request, AttendanceEventResolver $eventResolver): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        $q = TimeLog::query()->with('employee.branch', 'employee.company', 'device.branch');

        $employeeId = null;
        if ($user->can('attendance.view.any')) {
            if ($eid = $request->query('employee_id')) {
                $q->where('employee_id', $eid);
                $employeeId = (int) $eid;
            }
        } else {
            $employee = $user->employee;
            abort_unless($employee, 403, 'Your account is not linked to an employee record.');
            $q->where('employee_id', $employee->id);
            $employeeId = $employee->id;
        }
        $from = $request->query('from');
        $to = $request->query('to');
        if ($from) {
            $q->where('logged_at', '>=', $from);
        }
        if ($to) {
            $q->where('logged_at', '<=', $to.' 23:59:59');
        }
        $device = $request->query('device_id');
        if ($device) {
            $q->where('device_id', $device);
        }
        if ($cid = $request->query('company_id')) {
            $q->where('company_id', $cid);
        }
        $dept = $request->query('department_id');
        if ($dept) {
            $q->whereHas('employee', fn ($e) => $e->where('department_id', $dept));
        }

        // OB / COA / OT for the same scope (omitted when filtering to one terminal).
        $events = $device
            ? collect()
            : $eventResolver->resolve($from, $to, $employeeId, $dept ? (int) $dept : null);

        $headers = [
            'Logged At', 'Type', 'Employee No', 'Employee Name', 'Company',
            'Direction', 'Source', 'Device', 'Location', 'Reason', 'Approved By', 'Approved At',
        ];

        // Generator so 60k+ punch rows stream into the workbook without exhausting memory.
        $rows = (function () use ($q, $events) {
            foreach ($q->lazy(1000) as $l) {
                $branch = ($l->relationLoaded('device') && $l->device && $l->device->branch)
                    ? $l->device->branch
                    : $l->employee?->branch;
                yield [
                    $l->logged_at?->format('Y-m-d h:i:s A'), 'Punch',
                    $l->employee?->employee_no, $l->employee?->full_name, $l->employee?->company?->code,
                    $l->direction, $l->source, $l->device?->name ?? $l->device_id, $branch?->name, '', '', '',
                ];
            }
            foreach ($events as $ev) {
                $when = trim(($ev['date'] ?? '').' '.($ev['start_time'] ?? ''));
                if (($ev['date_to'] ?? null) && $ev['date_to'] !== $ev['date']) {
                    $when = $ev['date'].' – '.$ev['date_to'];
                }
                $direction = match ($ev['type']) {
                    'coa' => match ($ev['missed_punch'] ?? null) {
                        'both' => 'Missed In & Out', 'out' => 'Missed Out', 'in' => 'Missed In', default => 'Certified',
                    },
                    'ot' => $ev['hours'] !== null ? $ev['hours'].' hrs' : 'Overtime',
                    default => 'Off-site',
                };
                yield [
                    $when, $ev['label'], $ev['employee_no'], $ev['employee_name'], $ev['company_code'],
                    $direction, $ev['label'], '', $ev['detail'], $ev['reason'], $ev['approved_by'], $ev['approved_at'],
                ];
            }
        })();

        return \App\Support\XlsxReport::download('time-logs_'.now()->format('Ymd').'.xlsx', $headers, $rows, [
            'title' => 'Time Logs',
        ]);
    }

    /** Distinct device identifiers seen in the punch log (for the Device filter). */
    public function devices(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        $q = TimeLog::query()->select('device_id')->distinct()->whereNotNull('device_id');
        if (! $user->can('attendance.view.any')) {
            $employee = $user->employee;
            abort_unless($employee, 403, 'Your account is not linked to an employee record.');
            $q->where('employee_id', $employee->id);
        }

        $serials = $q->orderBy('device_id')->pluck('device_id');

        // Resolve each serial to its friendly device name so the filter reads as
        // locations, not raw serials. Non-device sources (WEB/MANUAL) fall back
        // to the raw identifier.
        $names = \App\Domain\Attendance\Models\AttendanceDevice::query()
            ->whereIn('serial_no', $serials)
            ->pluck('name', 'serial_no');

        $data = $serials->map(fn ($id) => [
            'device_id' => $id,
            'name' => $names[$id] ?? $id,
        ])->values();

        return response()->json(['data' => $data]);
    }

    public function store(TimeLogRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['company_id'] = $request->user()->active_company_id;
        $data['source'] = $data['source'] ?? 'manual';
        $data['ip_address'] = $request->ip();

        $log = TimeLog::create($data);

        return (new TimeLogResource($log))->response()->setStatusCode(201);
    }
}
