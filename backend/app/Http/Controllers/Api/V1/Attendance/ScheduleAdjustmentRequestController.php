<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\ScheduleAdjustmentRequest;
use App\Domain\Attendance\Models\ShiftAdjustment;
use App\Domain\Attendance\Services\DtrComputer;
use App\Http\Controllers\Concerns\HandlesApprovalWorkflow;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ScheduleAdjustmentRequestController extends Controller
{
    use HandlesApprovalWorkflow;

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $q = ScheduleAdjustmentRequest::query()
            ->with(['employee:id,employee_no,first_name,last_name', 'decidedBy:id,name'])
            ->orderByDesc('created_at');

        // HR sees all; employees see own
        if (! $user->can('attendance.view.any') && ! $user->can('attendance.manage')) {
            $employee = $user->employee;
            abort_unless($employee, 403, 'No employee record linked to your account.');
            $q->where('employee_id', $employee->id);
        }

        if ($status = $request->query('status')) {
            if ($status === 'pending_or_resubmitted') {
                $q->whereIn('status', ['pending', 'resubmitted']);
            } else {
                $q->where('status', $status);
            }
        }

        if ($empId = $request->query('employee_id')) {
            $q->where('employee_id', $empId);
        }

        $perPage = min((int) $request->query('per_page', 50), 200);
        $paginator = $q->paginate($perPage);

        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
                'per_page'     => $paginator->perPage(),
                'total'        => $paginator->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $companyId = $user->active_company_id;

        $data = $request->validate([
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')->where('company_id', $companyId)],
            'from_date'   => ['required', 'date'],
            'to_date'     => ['required', 'date', 'after_or_equal:from_date'],
            'shift_start' => ['required', 'date_format:H:i'],
            'break_start' => ['nullable', 'date_format:H:i'],
            'break_end'   => ['nullable', 'date_format:H:i', 'after:break_start'],
            'shift_end'   => ['required', 'date_format:H:i', 'after:shift_start'],
            'reason'      => ['nullable', 'string', 'max:500'],
        ]);

        // Managers may file for any employee; others file for self.
        if ($user->can('attendance.manage') && ! empty($data['employee_id'])) {
            $employeeId = (int) $data['employee_id'];
        } else {
            $employee = $user->employee;
            abort_unless($employee, 403, 'No employee record linked to your account.');
            $employeeId = $employee->id;
        }

        $req = ScheduleAdjustmentRequest::create([
            'company_id'      => $companyId,
            'employee_id'     => $employeeId,
            'from_date'       => $data['from_date'],
            'to_date'         => $data['to_date'],
            'shift_start'     => $data['shift_start'],
            'break_start'     => $data['break_start'] ?? null,
            'break_end'       => $data['break_end'] ?? null,
            'shift_end'       => $data['shift_end'],
            'reason'          => $data['reason'] ?? null,
            'status'          => 'pending',
            'filed_by_user_id' => $user->id,
        ]);

        return response()->json(['data' => $req->load('employee:id,employee_no,first_name,last_name')], 201);
    }

    public function approve(Request $request, ScheduleAdjustmentRequest $scheduleAdjustmentRequest, DtrComputer $dtr): JsonResponse
    {
        $this->assertCanDecideSchedule($request, $scheduleAdjustmentRequest);

        $validated = $request->validate([
            'decision_remarks' => ['nullable', 'string', 'max:500'],
        ]);

        $scheduleAdjustmentRequest->update([
            'status'           => 'approved',
            'decided_by_user_id' => $request->user()->id,
            'decided_at'       => now(),
            'decision_remarks' => $validated['decision_remarks'] ?? null,
        ]);

        // Apply a ShiftAdjustment for each date in the range.
        $from = CarbonImmutable::parse($scheduleAdjustmentRequest->from_date);
        $to   = CarbonImmutable::parse($scheduleAdjustmentRequest->to_date);

        $breakMinutes = $this->computeBreakMinutes(
            $scheduleAdjustmentRequest->break_start,
            $scheduleAdjustmentRequest->break_end
        );

        $employee = $scheduleAdjustmentRequest->employee;
        for ($day = $from; $day->lte($to); $day = $day->addDay()) {
            ShiftAdjustment::updateOrCreate(
                ['employee_id' => $employee->id, 'work_date' => $day->toDateString()],
                [
                    'company_id'        => $employee->company_id,
                    'is_rest_day'       => false,
                    'time_in'           => $scheduleAdjustmentRequest->shift_start,
                    'time_out'          => $scheduleAdjustmentRequest->shift_end,
                    'break_minutes'     => $breakMinutes,
                    'reason'            => $scheduleAdjustmentRequest->reason,
                    'created_by_user_id' => $request->user()->id,
                ],
            );
            $dtr->computeForEmployee($employee, $day, $day);
        }

        return response()->json(['data' => $scheduleAdjustmentRequest->fresh('employee:id,employee_no,first_name,last_name', 'decidedBy:id,name')]);
    }

    public function reject(Request $request, ScheduleAdjustmentRequest $scheduleAdjustmentRequest): JsonResponse
    {
        $this->assertCanDecideSchedule($request, $scheduleAdjustmentRequest);

        $validated = $request->validate([
            'decision_remarks' => ['nullable', 'string', 'max:500'],
        ]);

        $scheduleAdjustmentRequest->update([
            'status'           => 'rejected',
            'decided_by_user_id' => $request->user()->id,
            'decided_at'       => now(),
            'decision_remarks' => $validated['decision_remarks'] ?? null,
        ]);

        return response()->json(['data' => $scheduleAdjustmentRequest->fresh()]);
    }

    public function cancel(Request $request, ScheduleAdjustmentRequest $scheduleAdjustmentRequest): JsonResponse
    {
        $user = $request->user();

        if ($scheduleAdjustmentRequest->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'Only pending requests can be cancelled.']);
        }

        $isOwn = $user->employee?->id === $scheduleAdjustmentRequest->employee_id;
        abort_unless($user->can('attendance.manage') || $isOwn, 403);

        $scheduleAdjustmentRequest->update(['status' => 'cancelled']);

        return response()->json(['data' => $scheduleAdjustmentRequest->fresh()]);
    }

    private function assertCanDecideSchedule(Request $request, ScheduleAdjustmentRequest $model): void
    {
        if ($model->status !== 'pending') {
            throw ValidationException::withMessages(['status' => "Cannot act on a request that is already {$model->status}."]);
        }

        $user = $request->user();
        abort_unless(
            $user->can('attendance.manage') || $user->can('attendance.approve.any') || $user->can('attendance.approve.self_dept'),
            403,
            'You do not have permission to act on this request.'
        );
    }

    private function computeBreakMinutes(?string $breakStart, ?string $breakEnd): int
    {
        if (! $breakStart || ! $breakEnd) {
            return 60;
        }
        [$sh, $sm] = array_map('intval', explode(':', $breakStart));
        [$eh, $em] = array_map('intval', explode(':', $breakEnd));
        return max(0, ($eh * 60 + $em) - ($sh * 60 + $sm));
    }
}
