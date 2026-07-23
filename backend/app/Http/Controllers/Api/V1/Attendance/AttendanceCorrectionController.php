<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\AttendanceCorrection;
use App\Domain\Attendance\Services\AttendanceCorrectionApplier;
use App\Http\Controllers\Concerns\HandlesApprovalWorkflow;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\AttendanceCorrectionRequest;
use App\Http\Requests\Attendance\AttendanceDecisionRequest;
use App\Http\Resources\Attendance\AttendanceCorrectionResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class AttendanceCorrectionController extends Controller
{
    use HandlesApprovalWorkflow;

    public function index(Request $request): AnonymousResourceCollection
    {
        $q = AttendanceCorrection::query()
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

        $perPage = min((int) $request->query('per_page', 50), 200);

        return AttendanceCorrectionResource::collection($q->paginate($perPage));
    }

    public function store(AttendanceCorrectionRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['employee_id'] = $this->resolveEmployeeIdForStore($request, $data);
        $data['filed_by_user_id'] = $request->user()->id;
        $data['status'] = 'pending';

        $req = AttendanceCorrection::create($data);
        $req->load(['employee:id,employee_no,first_name,last_name']);

        $this->notifyAttendanceApprovers($req, 'Attendance correction', "/attendance/requests/corrections/{$req->id}");

        return (new AttendanceCorrectionResource($req))->response()->setStatusCode(201);
    }

    public function show(Request $request, AttendanceCorrection $attendanceCorrection): AttendanceCorrectionResource
    {
        $this->assertCanView($request, $attendanceCorrection);

        return new AttendanceCorrectionResource($attendanceCorrection->load(['employee', 'approver:id,name']));
    }

    public function approve(
        AttendanceDecisionRequest $request,
        AttendanceCorrection $attendanceCorrection,
        AttendanceCorrectionApplier $applier,
    ): AttendanceCorrectionResource {
        $this->assertCanDecide($request, $attendanceCorrection);

        DB::transaction(function () use ($request, $attendanceCorrection, $applier) {
            $attendanceCorrection->update([
                'status' => 'approved',
                'approved_by_user_id' => $request->user()->id,
                'decided_at' => now(),
                'decision_remarks' => $request->validated('decision_remarks'),
            ]);

            // Apply the approved change to the daily time record (and lock it).
            $applier->apply($attendanceCorrection);
        });

        return new AttendanceCorrectionResource($attendanceCorrection->load(['employee', 'approver:id,name']));
    }

    public function reject(AttendanceDecisionRequest $request, AttendanceCorrection $attendanceCorrection): AttendanceCorrectionResource
    {
        $this->assertCanDecide($request, $attendanceCorrection);

        $attendanceCorrection->update([
            'status' => 'rejected',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        return new AttendanceCorrectionResource($attendanceCorrection->load(['employee', 'approver:id,name']));
    }

    public function cancel(Request $request, AttendanceCorrection $attendanceCorrection): AttendanceCorrectionResource
    {
        $this->assertCanCancel($request, $attendanceCorrection);

        $attendanceCorrection->update(['status' => 'cancelled']);

        return new AttendanceCorrectionResource($attendanceCorrection->load(['employee']));
    }
}
