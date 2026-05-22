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
        abort_unless($request->user()->can('attendance.view'), 403);

        $q = TimeLog::query()->orderBy('logged_at');

        if ($eid = $request->query('employee_id')) {
            $q->where('employee_id', $eid);
        }
        if ($from = $request->query('from')) {
            $q->where('logged_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('logged_at', '<=', $to.' 23:59:59');
        }

        return TimeLogResource::collection($q->limit(500)->get());
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
