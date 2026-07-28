<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\TimeLog;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\TimeLogRequest;
use App\Http\Resources\Attendance\TimeLogResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class TimeLogController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        // employee.branch feeds the geofence verdict + site location in TimeLogResource;
        // device (and its branch) resolves the friendly terminal name and site;
        // employee.company is the last-resort location fallback.
        $q = TimeLog::query()
            ->with('employee.branch', 'employee.company', 'device.branch')
            ->orderByDesc('logged_at'); // newest punches first

        // HR (attendance.view.any) sees everyone; everyone else is locked to their own logs.
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
            $q->where('logged_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('logged_at', '<=', $to.' 23:59:59');
        }
        if ($device = $request->query('device_id')) {
            $q->where('device_id', $device);
        }
        if ($cid = $request->query('company_id')) {
            $q->where('company_id', $cid);
        }
        if ($dept = $request->query('department_id')) {
            $q->whereHas('employee', fn ($e) => $e->where('department_id', $dept));
        }

        return TimeLogResource::collection($q->limit(500)->get());
    }

    /**
     * Export the (filtered) punch log as CSV. Honours the same filters and the
     * company scope as index(); streamed in chunks so a large range stays memory-safe.
     */
    public function export(Request $request): \Symfony\Component\HttpFoundation\StreamedResponse
    {
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        $q = TimeLog::query()->with('employee.branch', 'employee.company', 'device.branch');

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
            $q->where('logged_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('logged_at', '<=', $to.' 23:59:59');
        }
        if ($device = $request->query('device_id')) {
            $q->where('device_id', $device);
        }
        if ($cid = $request->query('company_id')) {
            $q->where('company_id', $cid);
        }
        if ($dept = $request->query('department_id')) {
            $q->whereHas('employee', fn ($e) => $e->where('department_id', $dept));
        }

        return response()->streamDownload(function () use ($q) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Logged At', 'Employee No', 'Employee Name', 'Company', 'Direction', 'Source', 'Device', 'Location']);

            // lazy() chunks by primary key and keeps eager-loads, so 60k+ rows
            // stream without exhausting memory.
            foreach ($q->lazy(1000) as $l) {
                $branch = ($l->relationLoaded('device') && $l->device && $l->device->branch)
                    ? $l->device->branch
                    : $l->employee?->branch;
                fputcsv($out, [
                    $l->logged_at?->format('Y-m-d h:i:s A'),
                    $l->employee?->employee_no,
                    $l->employee?->full_name,
                    $l->employee?->company?->code,
                    $l->direction,
                    $l->source,
                    $l->device?->name ?? $l->device_id,
                    $branch?->name,
                ]);
            }
            fclose($out);
        }, 'time-logs.csv', ['Content-Type' => 'text/csv']);
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
