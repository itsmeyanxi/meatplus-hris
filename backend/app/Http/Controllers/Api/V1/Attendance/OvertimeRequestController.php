<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\OvertimeRequest;
use App\Domain\Attendance\Services\DtrComputer;
use App\Http\Controllers\Concerns\HandlesApprovalWorkflow;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\AttendanceDecisionRequest;
use App\Http\Requests\Attendance\OvertimeRequestRequest;
use App\Http\Resources\Attendance\OvertimeRequestResource;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class OvertimeRequestController extends Controller
{
    use HandlesApprovalWorkflow;

    public function index(Request $request): AnonymousResourceCollection
    {
        $q = OvertimeRequest::query()
            ->with(['employee:id,employee_no,first_name,last_name', 'approver:id,name', 'filer:id,name'])
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

        return OvertimeRequestResource::collection($q->limit(500)->get());
    }

    public function store(OvertimeRequestRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['employee_id'] = $this->resolveEmployeeIdForStore($request, $data);
        $data['filed_by_user_id'] = $request->user()->id;
        $data['status'] = 'pending';

        $req = OvertimeRequest::create($data);
        $req->load(['employee:id,employee_no,first_name,last_name']);

        return (new OvertimeRequestResource($req))->response()->setStatusCode(201);
    }

    public function show(Request $request, OvertimeRequest $overtimeRequest): OvertimeRequestResource
    {
        $this->assertCanView($request, $overtimeRequest);

        return new OvertimeRequestResource(
            $overtimeRequest->load(['employee', 'approver:id,name', 'filer:id,name']),
        );
    }

    public function approve(AttendanceDecisionRequest $request, OvertimeRequest $overtimeRequest, DtrComputer $dtr): OvertimeRequestResource
    {
        $this->assertCanDecide($request, $overtimeRequest);

        $overtimeRequest->update([
            'status' => 'approved',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        $this->recomputeDay($dtr, $overtimeRequest);

        return new OvertimeRequestResource($overtimeRequest->load(['employee', 'approver:id,name']));
    }

    public function reject(AttendanceDecisionRequest $request, OvertimeRequest $overtimeRequest): OvertimeRequestResource
    {
        $this->assertCanDecide($request, $overtimeRequest);

        $overtimeRequest->update([
            'status' => 'rejected',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        return new OvertimeRequestResource($overtimeRequest->load(['employee', 'approver:id,name']));
    }

    public function cancel(Request $request, OvertimeRequest $overtimeRequest, DtrComputer $dtr): OvertimeRequestResource
    {
        $this->assertCanCancel($request, $overtimeRequest);

        $overtimeRequest->update(['status' => 'cancelled']);

        $this->recomputeDay($dtr, $overtimeRequest);

        return new OvertimeRequestResource($overtimeRequest->load(['employee']));
    }

    /** Recompute the OT date's daily record so the approved/cancelled OT is reflected. */
    private function recomputeDay(DtrComputer $dtr, OvertimeRequest $overtimeRequest): void
    {
        $date = CarbonImmutable::parse($overtimeRequest->date);
        $dtr->computeForEmployee($overtimeRequest->employee, $date, $date);
    }
}
