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

        // employee.branch feeds the geofence verdict in TimeLogResource;
        // device resolves the friendly, location-identifying terminal name.
        $q = TimeLog::query()->with('employee.branch', 'device')->orderBy('logged_at');

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

        return TimeLogResource::collection($q->limit(500)->get());
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
