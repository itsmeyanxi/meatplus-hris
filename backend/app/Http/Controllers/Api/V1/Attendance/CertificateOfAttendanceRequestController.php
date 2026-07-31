<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\CertificateOfAttendanceRequest;
use App\Http\Controllers\Concerns\HandlesApprovalWorkflow;
use App\Http\Controllers\Concerns\NotifiesSupervisor;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\CertificateOfAttendanceRequestRequest;
use App\Http\Requests\Attendance\AttendanceDecisionRequest;
use App\Http\Resources\Attendance\CertificateOfAttendanceRequestResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CertificateOfAttendanceRequestController extends Controller
{
    use HandlesApprovalWorkflow;
    use NotifiesSupervisor;

    /**
     * POST /certificate-of-attendance-requests/{id}/revert
     * Undo a decision (approved/rejected) back to pending and recompute the DTR.
     */
    public function revert(Request $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): CertificateOfAttendanceRequestResource
    {
        $this->assertCanRevert($request, $certificateOfAttendanceRequest);

        $certificateOfAttendanceRequest->update([
            'status' => 'pending',
            'approved_by_user_id' => null,
            'decided_at' => null,
            'decision_remarks' => null,
        ]);

        $this->recomputeRequestDays($certificateOfAttendanceRequest);

        return new CertificateOfAttendanceRequestResource($certificateOfAttendanceRequest->load(['employee', 'approver:id,name']));
    }

    /**
     * POST /certificate-of-attendance-requests/{id}/notify-supervisor
     * Nudge the subject's direct supervisor to approve this COA.
     */
    public function notifySupervisor(Request $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): JsonResponse
    {
        $user = $request->user();
        $isOwner = $user->employee && $certificateOfAttendanceRequest->employee_id === $user->employee->id;
        abort_unless(
            $isOwner || $user->can('attendance.approve.any') || $user->can('attendance.approve.self_dept') || $user->can('attendance.manage') || $user->can('attendance.view.any'),
            403,
            'You cannot notify the supervisor for this request.'
        );

        if ($certificateOfAttendanceRequest->status !== 'pending') {
            return response()->json(['message' => "This request is already {$certificateOfAttendanceRequest->status}."], 422);
        }

        return $this->pingSupervisor(
            $certificateOfAttendanceRequest->employee_id,
            'Certificate of Attendance',
            $certificateOfAttendanceRequest->work_date?->toDateString(),
            "/certificates-of-attendance/{$certificateOfAttendanceRequest->id}",
            $certificateOfAttendanceRequest->id,
        );
    }

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

        $this->notifyAttendanceApprovers(
            $req,
            'Certificate of Attendance',
            "/attendance/requests/certificate-of-attendance/{$req->id}",
        );

        return (new CertificateOfAttendanceRequestResource($req))->response()->setStatusCode(201);
    }

    public function show(Request $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): CertificateOfAttendanceRequestResource
    {
        $this->assertCanView($request, $certificateOfAttendanceRequest);

        return new CertificateOfAttendanceRequestResource(
            $certificateOfAttendanceRequest->load(['employee', 'approver:id,name']),
        );
    }

    public function approve(AttendanceDecisionRequest $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): CertificateOfAttendanceRequestResource
    {
        $this->assertCanDecide($request, $certificateOfAttendanceRequest);

        $certificateOfAttendanceRequest->update([
            'status' => 'approved',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        $this->recomputeRequestDays($certificateOfAttendanceRequest);

        return new CertificateOfAttendanceRequestResource($certificateOfAttendanceRequest->load(['employee', 'approver:id,name']));
    }

    public function reject(AttendanceDecisionRequest $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): CertificateOfAttendanceRequestResource
    {
        $this->assertCanDecide($request, $certificateOfAttendanceRequest);

        $certificateOfAttendanceRequest->update([
            'status' => 'rejected',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        $this->recomputeRequestDays($certificateOfAttendanceRequest);

        return new CertificateOfAttendanceRequestResource($certificateOfAttendanceRequest->load(['employee', 'approver:id,name']));
    }

    public function cancel(Request $request, CertificateOfAttendanceRequest $certificateOfAttendanceRequest): CertificateOfAttendanceRequestResource
    {
        $this->assertCanCancel($request, $certificateOfAttendanceRequest);

        $certificateOfAttendanceRequest->update(['status' => 'cancelled']);

        $this->recomputeRequestDays($certificateOfAttendanceRequest);

        return new CertificateOfAttendanceRequestResource($certificateOfAttendanceRequest->load(['employee']));
    }
}
