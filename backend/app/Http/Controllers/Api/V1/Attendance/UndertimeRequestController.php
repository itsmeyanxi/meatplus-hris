<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\UndertimeRequest;
use App\Http\Controllers\Concerns\HandlesApprovalWorkflow;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\DecisionRequest;
use App\Http\Requests\Attendance\UndertimeRequestRequest;
use App\Http\Resources\Attendance\UndertimeRequestResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class UndertimeRequestController extends Controller
{
    use HandlesApprovalWorkflow;

    public function index(Request $request): AnonymousResourceCollection
    {
        $q = UndertimeRequest::query()
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

        return UndertimeRequestResource::collection($q->limit(500)->get());
    }

    public function store(UndertimeRequestRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['employee_id'] = $this->resolveEmployeeIdForStore($request, $data);
        $data['filed_by_user_id'] = $request->user()->id;
        $data['status'] = 'pending';

        $req = UndertimeRequest::create($data);
        $req->load(['employee:id,employee_no,first_name,last_name']);

        return (new UndertimeRequestResource($req))->response()->setStatusCode(201);
    }

    public function show(Request $request, UndertimeRequest $undertimeRequest): UndertimeRequestResource
    {
        return new UndertimeRequestResource(
            $undertimeRequest->load(['employee', 'approver:id,name']),
        );
    }

    public function approve(DecisionRequest $request, UndertimeRequest $undertimeRequest): UndertimeRequestResource
    {
        $this->assertCanDecide($request, $undertimeRequest);

        $undertimeRequest->update([
            'status' => 'approved',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        return new UndertimeRequestResource($undertimeRequest->load(['employee', 'approver:id,name']));
    }

    public function reject(DecisionRequest $request, UndertimeRequest $undertimeRequest): UndertimeRequestResource
    {
        $this->assertCanDecide($request, $undertimeRequest);

        $undertimeRequest->update([
            'status' => 'rejected',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        return new UndertimeRequestResource($undertimeRequest->load(['employee', 'approver:id,name']));
    }

    public function cancel(Request $request, UndertimeRequest $undertimeRequest): UndertimeRequestResource
    {
        $this->assertCanCancel($request, $undertimeRequest);

        $undertimeRequest->update(['status' => 'cancelled']);

        return new UndertimeRequestResource($undertimeRequest->load(['employee']));
    }
}
