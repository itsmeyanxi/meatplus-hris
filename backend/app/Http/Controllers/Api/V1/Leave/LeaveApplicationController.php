<?php

namespace App\Http\Controllers\Api\V1\Leave;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Leave\Models\LeaveApplication;
use App\Domain\Leave\Models\LeaveType;
use App\Domain\Leave\Services\LeaveBalanceService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Leave\LeaveDecisionRequest;
use App\Http\Requests\Leave\StoreLeaveApplicationRequest;
use App\Http\Resources\Leave\LeaveApplicationResource;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LeaveApplicationController extends Controller
{
    public function __construct(private readonly LeaveBalanceService $balanceService)
    {
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();
        $q = LeaveApplication::query()
            ->with([
                'employee:id,employee_no,first_name,last_name',
                'leaveType:id,code,name',
                'approver:id,name',
            ])
            ->orderByDesc('date_from');

        // Only the leave approver (dept_head) sees the whole company.
        // Everyone else — employees, HR, super_admin — sees only their own.
        if (! $user->can('leave.approve.any')) {
            if ($user->employee) {
                $q->where('employee_id', $user->employee->id);
            } else {
                // No employee record means no personal leaves to show.
                $q->whereRaw('1 = 0');
            }
        }

        foreach (['status', 'employee_id', 'leave_type_id'] as $f) {
            if ($v = $request->query($f)) {
                $q->where($f, $v);
            }
        }
        if ($from = $request->query('from')) {
            $q->where('date_from', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('date_to', '<=', $to);
        }

        return LeaveApplicationResource::collection($q->limit(500)->get());
    }

    public function store(StoreLeaveApplicationRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = $request->user();

        // Resolve employee
        if (! $user->can('leave.approve.any')) {
            if (! $user->employee) {
                abort(403, 'You are not linked to an employee record.');
            }
            $data['employee_id'] = $user->employee->id;
        }

        $employee = Employee::findOrFail($data['employee_id']);
        $type = LeaveType::findOrFail($data['leave_type_id']);

        // Gender restriction
        if ($type->gender_restriction && $type->gender_restriction !== $employee->gender) {
            throw ValidationException::withMessages([
                'leave_type_id' => "This leave type is restricted to {$type->gender_restriction} employees.",
            ]);
        }

        // Compute days_count (inclusive). Half-day applies only to a 1-day range.
        $from = CarbonImmutable::parse($data['date_from']);
        $to = CarbonImmutable::parse($data['date_to']);
        $days = $from->diffInDays($to) + 1;
        if (! empty($data['half_day']) && $days === 1) {
            $days = 0.5;
        } elseif (! empty($data['half_day'])) {
            throw ValidationException::withMessages([
                'half_day' => 'Half-day only applies to single-day leaves.',
            ]);
        }
        $data['days_count'] = $days;

        // Max consecutive days check
        if ($type->max_consecutive_days && $days > $type->max_consecutive_days) {
            throw ValidationException::withMessages([
                'date_to' => "This leave type allows a maximum of {$type->max_consecutive_days} consecutive day(s).",
            ]);
        }

        // Minimum filing lead time
        if ($type->min_days_filing_lead > 0) {
            $earliest = CarbonImmutable::now()->addDays($type->min_days_filing_lead)->startOfDay();
            if ($from->lt($earliest)) {
                throw ValidationException::withMessages([
                    'date_from' => "This leave type must be filed at least {$type->min_days_filing_lead} day(s) in advance.",
                ]);
            }
        }

        // Balance check (uses date_from year — single-year leaves only in Phase 3.0)
        $year = (int) $from->year;
        $balance = $this->balanceService->ensureBalance($employee, $type, $year);
        if ($balance->current_balance < $days) {
            throw ValidationException::withMessages([
                'days_count' => "Insufficient {$type->code} balance: have {$balance->current_balance}, requested {$days}.",
            ]);
        }

        $data['filed_by_user_id'] = $user->id;
        $data['status'] = 'pending';
        $data['submitted_at'] = now();

        $leave = LeaveApplication::create($data);
        $leave->load(['employee:id,employee_no,first_name,last_name', 'leaveType:id,code,name']);

        return (new LeaveApplicationResource($leave))->response()->setStatusCode(201);
    }

    public function show(Request $request, LeaveApplication $leaveApplication): LeaveApplicationResource
    {
        $this->ensureCanView($request, $leaveApplication);

        return new LeaveApplicationResource(
            $leaveApplication->load(['employee', 'leaveType', 'approver:id,name']),
        );
    }

    public function approve(LeaveDecisionRequest $request, LeaveApplication $leaveApplication): LeaveApplicationResource
    {
        $this->assertCanDecide($request, $leaveApplication);

        DB::transaction(function () use ($request, $leaveApplication) {
            $leaveApplication->update([
                'status' => 'approved',
                'approved_by_user_id' => $request->user()->id,
                'decided_at' => now(),
                'decision_remarks' => $request->validated('decision_remarks'),
            ]);

            // Consume balance
            $year = (int) $leaveApplication->date_from->year;
            $balance = $this->balanceService->ensureBalance(
                $leaveApplication->employee,
                $leaveApplication->leaveType,
                $year,
            );
            $this->balanceService->consume($balance, (float) $leaveApplication->days_count);
        });

        return new LeaveApplicationResource(
            $leaveApplication->load(['employee', 'leaveType', 'approver:id,name']),
        );
    }

    public function reject(LeaveDecisionRequest $request, LeaveApplication $leaveApplication): LeaveApplicationResource
    {
        $this->assertCanDecide($request, $leaveApplication);

        $leaveApplication->update([
            'status' => 'rejected',
            'approved_by_user_id' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->validated('decision_remarks'),
        ]);

        return new LeaveApplicationResource(
            $leaveApplication->load(['employee', 'leaveType', 'approver:id,name']),
        );
    }

    public function cancel(Request $request, LeaveApplication $leaveApplication): LeaveApplicationResource
    {
        $user = $request->user();

        $canCancel = $user->can('leave.approve.any')
            || ($user->employee && $leaveApplication->employee_id === $user->employee->id);
        abort_unless($canCancel, 403);

        if (! in_array($leaveApplication->status, ['pending', 'approved'])) {
            throw ValidationException::withMessages([
                'status' => "Cannot cancel a leave that is already {$leaveApplication->status}.",
            ]);
        }

        // If cancelling an APPROVED leave, restore the balance
        $wasApproved = $leaveApplication->status === 'approved';

        DB::transaction(function () use ($leaveApplication, $wasApproved) {
            $leaveApplication->update(['status' => 'cancelled']);

            if ($wasApproved) {
                $year = (int) $leaveApplication->date_from->year;
                $balance = $this->balanceService->ensureBalance(
                    $leaveApplication->employee,
                    $leaveApplication->leaveType,
                    $year,
                );
                $this->balanceService->restore($balance, (float) $leaveApplication->days_count);
            }
        });

        return new LeaveApplicationResource(
            $leaveApplication->load(['employee', 'leaveType']),
        );
    }

    private function ensureCanView(Request $request, LeaveApplication $leave): void
    {
        $user = $request->user();
        // Only the approver (dept_head) may view others' leaves.
        if ($user->can('leave.approve.any')) {
            return;
        }
        if ($user->employee && $leave->employee_id === $user->employee->id) {
            return;
        }
        abort(403);
    }

    private function assertCanDecide(Request $request, LeaveApplication $leave): void
    {
        if ($leave->status !== 'pending') {
            throw ValidationException::withMessages([
                'status' => "Cannot act on a request that is already {$leave->status}.",
            ]);
        }

        $user = $request->user();
        if ($user->employee && $leave->employee_id === $user->employee->id) {
            abort(403, 'You cannot approve your own leave.');
        }

        if ($user->can('leave.approve.any')) {
            return;
        }

        if ($user->can('leave.approve.self_dept')) {
            $approverEmp = $user->employee?->id;
            // An approver with no employee record can't be anyone's manager/dept head.
            if (! $approverEmp) {
                abort(403, 'You do not have permission to act on this request.');
            }
            $subj = $leave->employee()->first(['id', 'manager_employee_id', 'department_id']);
            if ($subj && $subj->manager_employee_id === $approverEmp) {
                return;
            }
            $dept = $subj?->department()->first(['id', 'head_employee_id']);
            if ($dept && $dept->head_employee_id === $approverEmp) {
                return;
            }
        }

        abort(403, 'You do not have permission to act on this request.');
    }
}
