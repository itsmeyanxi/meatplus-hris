<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\OfficialBusinessRequest;
use App\Http\Controllers\Concerns\HandlesApprovalWorkflow;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\AttendanceDecisionRequest;
use App\Http\Requests\Attendance\OfficialBusinessRequestRequest;
use App\Http\Resources\Attendance\OfficialBusinessRequestResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class OfficialBusinessRequestController extends Controller
{
    use HandlesApprovalWorkflow;

    public function index(Request $request): AnonymousResourceCollection
    {
        $q = OfficialBusinessRequest::query()
            ->with(['employee:id,employee_no,first_name,last_name', 'approver:id,name'])
            ->orderByDesc('date');

        $q = $this->applyListingScope($q, $request);

        foreach (['status', 'employee_id'] as $f) {
            if ($v = $request->query($f)) {
                $q->where($f, $v);
            }
        }
        if ($from = $request->query('from')) {
            $q->where('date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('date', '<=', $to);
        }

        return OfficialBusinessRequestResource::collection($q->limit(500)->get());
    }

    public function store(OfficialBusinessRequestRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['employee_id'] = $this->resolveEmployeeIdForStore($request, $data);
        $data['filed_by_user_id'] = $request->user()->id;
        $data['status'] = 'pending';

        $req = OfficialBusinessRequest::create($data);
        $req->load(['employee:id,employee_no,first_name,last_name']);

        $this->notifyAttendanceApprovers($req, 'Official Business request', "/attendance/requests/official-business/{$req->id}");

        return (new OfficialBusinessRequestResource($req))->response()->setStatusCode(201);
    }

    public function show(Request $request, OfficialBusinessRequest $officialBusinessRequest): OfficialBusinessRequestResource
    {
        $this->assertCanView($request, $officialBusinessRequest);

        return new OfficialBusinessRequestResource($officialBusinessRequest->load(['employee', 'approver:id,name']));
    }

    public function approve(AttendanceDecisionRequest $request, OfficialBusinessRequest $officialBusinessRequest): OfficialBusinessRequestResource
    {
        $this->assertCanDecide($request, $officialBusinessRequest);

        $officialBusinessRequest->update([
            'status' => 'approved',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        return new OfficialBusinessRequestResource($officialBusinessRequest->load(['employee', 'approver:id,name']));
    }

    public function reject(AttendanceDecisionRequest $request, OfficialBusinessRequest $officialBusinessRequest): OfficialBusinessRequestResource
    {
        $this->assertCanDecide($request, $officialBusinessRequest);

        $officialBusinessRequest->update([
            'status' => 'rejected',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        return new OfficialBusinessRequestResource($officialBusinessRequest->load(['employee', 'approver:id,name']));
    }

    public function cancel(Request $request, OfficialBusinessRequest $officialBusinessRequest): OfficialBusinessRequestResource
    {
        $this->assertCanCancel($request, $officialBusinessRequest);

        $officialBusinessRequest->update(['status' => 'cancelled']);

        return new OfficialBusinessRequestResource($officialBusinessRequest->load(['employee']));
    }
}
