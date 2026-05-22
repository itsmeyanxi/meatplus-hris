<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\CertificateOfAttendanceRequest;
use App\Http\Controllers\Concerns\HandlesApprovalWorkflow;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\CertificateOfAttendanceRequestRequest;
use App\Http\Requests\Attendance\DecisionRequest;
use App\Http\Resources\Attendance\CertificateOfAttendanceRequestResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CertificateOfAttendanceRequestController extends Controller
{
    use HandlesApprovalWorkflow;

    public function index(Request $request): AnonymousResourceCollection
    {
        $q = CertificateOfAttendanceRequest::query()
            ->with(['employee:id,employee_no,first_name,last_name', 'approver:id,name'])
            ->orderByDesc('work_date');

        $q = $this->applyListingScope($q, $request);

        foreach (['status', 'employee_id'] as $f) {
            if ($v = $request->query($f)) {
                $q->where($f, $v);
            }
        }
        if ($from = $request->query('from')) {
            $q->where('work_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('work_date', '<=', $to);
        }

        return CertificateOfAttendanceRequestResource::collection($q->limit(500)->get());
    }

    public function store(CertificateOfAttendanceRequestRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['employee_id'] = $this->resolveEmployeeIdForStore($request, $data);
        $data['filed_by_user_id'] = $request->user()->id;
        $data['status'] = 'pending';

        $req = CertificateOfAttendanceRequest::create($data);
        $req->load(['employee:id,employee_no,first_name,last_name']);

        return (new CertificateOfAttendanceRequestResource($req))->response()->setStatusCode(201);
    }

    public function show(Request $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): CertificateOfAttendanceRequestResource
    {
        return new CertificateOfAttendanceRequestResource(
            $certificateOfAttendanceRequest->load(['employee', 'approver:id,name']),
        );
    }

    public function approve(DecisionRequest $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): CertificateOfAttendanceRequestResource
    {
        $this->assertCanDecide($request, $certificateOfAttendanceRequest);

        $certificateOfAttendanceRequest->update([
            'status' => 'approved',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        return new CertificateOfAttendanceRequestResource($certificateOfAttendanceRequest->load(['employee', 'approver:id,name']));
    }

    public function reject(DecisionRequest $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): CertificateOfAttendanceRequestResource
    {
        $this->assertCanDecide($request, $certificateOfAttendanceRequest);

        $certificateOfAttendanceRequest->update([
            'status' => 'rejected',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        return new CertificateOfAttendanceRequestResource($certificateOfAttendanceRequest->load(['employee', 'approver:id,name']));
    }

    public function cancel(Request $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): CertificateOfAttendanceRequestResource
    {
        $this->assertCanCancel($request, $certificateOfAttendanceRequest);

        $certificateOfAttendanceRequest->update(['status' => 'cancelled']);

        return new CertificateOfAttendanceRequestResource($certificateOfAttendanceRequest->load(['employee']));
    }
}
