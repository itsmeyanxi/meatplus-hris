<?php

namespace App\Http\Controllers\Api\V1\Leave;

use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use App\Domain\Leave\Models\LeaveApplication;
use App\Domain\Leave\Models\LeaveType;
use App\Domain\Leave\Services\LeaveBalanceService;
use App\Http\Controllers\Concerns\NotifiesSupervisor;
use App\Http\Controllers\Controller;
use App\Http\Requests\Leave\LeaveDecisionRequest;
use App\Http\Requests\Leave\StoreLeaveApplicationRequest;
use App\Http\Resources\Leave\LeaveApplicationResource;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use App\Notifications\LeaveApplicationApproved;
use App\Notifications\LeaveApplicationRejected;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class LeaveApplicationController extends Controller
{
    use NotifiesSupervisor;

    public function __construct(private readonly LeaveBalanceService $balanceService)
    {
    }

    /**
     * POST /leave-applications/{id}/notify-supervisor
     * Nudge the applicant's direct supervisor to approve, instead of an
     * admin/HR deciding it. Open to the applicant or anyone who can approve.
     */
    public function notifySupervisor(Request $request, LeaveApplication $leaveApplication): JsonResponse
    {
        $user = $request->user();
        $isOwner = $user->employee && $leaveApplication->employee_id === $user->employee->id;
        abort_unless(
            $isOwner || $user->can('leave.approve.any') || $user->can('leave.approve.self_dept') || $user->can('leave.manage') || $user->can('leave.view.any'),
            403,
            'You cannot notify the supervisor for this request.'
        );

        if ($leaveApplication->status !== 'pending') {
            return response()->json(['message' => "This request is already {$leaveApplication->status}."], 422);
        }

        return $this->pingSupervisor(
            $leaveApplication->employee_id,
            'Leave',
            $leaveApplication->date_from?->toDateString(),
            "/leaves/{$leaveApplication->id}",
            $leaveApplication->id,
        );
    }

    /** Bulk-import leave applications from a CSV/XLSX (deduped by employee+type+dates). */
    public function import(Request $request, \App\Domain\HRIS\Services\LeaveApplicationImportService $service): JsonResponse
    {
        abort_unless($request->user()->can('leave.approve.any'), 403);
        $request->validate(['file' => ['required', 'file', 'max:5120']]);
        $file = $request->file('file');
        $head = @file_get_contents($file->getRealPath(), false, null, 0, 8) ?: '';
        $format = str_starts_with($head, "PK\x03\x04") ? 'xlsx' : (str_starts_with($head, "\xD0\xCF\x11\xE0") ? null : 'csv');
        if ($format === null) {
            return response()->json(['message' => 'Unsupported file. Upload a .csv or .xlsx.'], 422);
        }

        return response()->json($service->import($file->getRealPath(), $format, (int) $request->user()->active_company_id));
    }

    /** CSV template for the leave import. */
    public function importTemplate(Request $request): StreamedResponse
    {
        abort_unless($request->user()->can('leave.approve.any'), 403);
        $headers = ['EmployeeID', 'LeaveTypeName', 'DateFrom', 'DateTo', 'WithPayNoOfdays', 'WoutPayNoOfDays', 'Reason', 'LeaveStatus'];
        $ex = ['2160067', 'Vacation Leave', '2026-04-10', '2026-04-10', '0', '1', 'family matter', 'Approved'];

        return response()->streamDownload(function () use ($headers, $ex) {
            $o = fopen('php://output', 'w');
            fputcsv($o, $headers);
            fputcsv($o, $ex);
            fclose($o);
        }, 'leave_import_template.csv', ['Content-Type' => 'text/csv']);
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

        // Scope visible applications by permission level.
        if (! $user->can('leave.approve.any')) {
            if ($user->can('leave.approve.self_dept') && $user->employee) {
                // Supervisor / dept head: own leaves + direct reports + dept members.
                $approverEmpId = $user->employee->id;
                $q->where(function ($sub) use ($approverEmpId) {
                    $sub->where('employee_id', $approverEmpId)
                        ->orWhereHas('employee', function ($emp) use ($approverEmpId) {
                            $emp->where('manager_employee_id', $approverEmpId)
                                ->orWhereHas('department', fn ($dept) => $dept->where('head_employee_id', $approverEmpId));
                        });
                });
            } elseif ($user->employee) {
                $q->where('employee_id', $user->employee->id);
            } else {
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

        // Paid vs unpaid label: honour an explicit choice, else default to the
        // leave type's is_paid. (Label only — DTR pay & credits are type-driven.)
        $data['is_paid'] = $request->has('is_paid')
            ? $request->boolean('is_paid')
            : (bool) $type->is_paid;

        // Gender restriction
        if ($type->gender_restriction && $type->gender_restriction !== $employee->gender) {
            throw ValidationException::withMessages([
                'leave_type_id' => "This leave type is restricted to {$type->gender_restriction} employees.",
            ]);
        }

        // Compute days_count (inclusive). Half-day applies only to a 1-day range.
        // Cast to int: Carbon 3's diffInDays returns a float, so `=== 1` would never
        // match (float(1) !== int(1)) and every single-day half-day was wrongly rejected.
        $from = CarbonImmutable::parse($data['date_from'])->startOfDay();
        $to = CarbonImmutable::parse($data['date_to'])->startOfDay();
        $spanDays = (int) $from->diffInDays($to) + 1;
        if (! empty($data['half_day'])) {
            if ($spanDays !== 1) {
                throw ValidationException::withMessages([
                    'half_day' => 'Half-day only applies to single-day leaves.',
                ]);
            }
            $days = 0.5;
        } else {
            $days = $spanDays;
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

        // Balance check (uses date_from year — single-year leaves only in Phase 3.0).
        // Only enforced for credit-tracked leaves; uncredited/unpaid types file
        // freely (the approver is the control there).
        $year = (int) $from->year;
        $balance = $this->balanceService->ensureBalance($employee, $type, $year);
        if ($this->balanceService->isCreditTracked($type, $balance) && $balance->current_balance < $days) {
            throw ValidationException::withMessages([
                'days_count' => "Insufficient {$type->code} balance: have {$balance->current_balance}, requested {$days}.",
            ]);
        }

        if ($request->hasFile('attachment')) {
            $data['attachment_path'] = $request->file('attachment')
                ->store('leave-attachments', 'local');
        }
        unset($data['attachment']);

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

    public function approve(LeaveDecisionRequest $request, LeaveApplication $leaveApplication, DtrComputer $dtr): LeaveApplicationResource
    {
        $this->assertCanDecide($request, $leaveApplication);

        DB::transaction(function () use ($request, $leaveApplication, $dtr) {
            $leaveApplication->update([
                'status' => 'approved',
                'approved_by_user_id' => $request->user()->id,
                'decided_at' => now(),
                'decision_remarks' => $request->validated('decision_remarks'),
            ]);

            // Consume balance — only for credit-tracked leaves, so uncredited
            // statutory/unpaid types don't push the balance negative.
            $year = (int) $leaveApplication->date_from->year;
            $balance = $this->balanceService->ensureBalance(
                $leaveApplication->employee,
                $leaveApplication->leaveType,
                $year,
            );
            if ($this->balanceService->isCreditTracked($leaveApplication->leaveType, $balance)) {
                $this->balanceService->consume($balance, (float) $leaveApplication->days_count);
            }

            // Post the leave onto the daily time records for the covered dates.
            $dtr->computeForEmployee(
                $leaveApplication->employee,
                CarbonImmutable::parse($leaveApplication->date_from),
                CarbonImmutable::parse($leaveApplication->date_to),
            );
        });

        // Notify the employee
        $applicantUser = $leaveApplication->employee->user ?? null;
        if ($applicantUser) {
            $applicantUser->notify(new LeaveApplicationApproved(
                $leaveApplication->load('leaveType'),
                $request->validated('decision_remarks'),
            ));
        }

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

        // Notify the employee
        $applicantUser = $leaveApplication->employee->user ?? null;
        if ($applicantUser) {
            $applicantUser->notify(new LeaveApplicationRejected(
                $leaveApplication->load('leaveType'),
                $request->validated('decision_remarks'),
            ));
        }

        return new LeaveApplicationResource(
            $leaveApplication->load(['employee', 'leaveType', 'approver:id,name']),
        );
    }

    public function cancel(Request $request, LeaveApplication $leaveApplication, DtrComputer $dtr): LeaveApplicationResource
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

        DB::transaction(function () use ($leaveApplication, $wasApproved, $dtr) {
            $leaveApplication->update(['status' => 'cancelled']);

            if ($wasApproved) {
                $year = (int) $leaveApplication->date_from->year;
                $balance = $this->balanceService->ensureBalance(
                    $leaveApplication->employee,
                    $leaveApplication->leaveType,
                    $year,
                );
                if ($this->balanceService->isCreditTracked($leaveApplication->leaveType, $balance)) {
                    $this->balanceService->restore($balance, (float) $leaveApplication->days_count);
                }

                // Un-post the leave from the daily time records.
                $dtr->computeForEmployee(
                    $leaveApplication->employee,
                    CarbonImmutable::parse($leaveApplication->date_from),
                    CarbonImmutable::parse($leaveApplication->date_to),
                );
            }
        });

        return new LeaveApplicationResource(
            $leaveApplication->load(['employee', 'leaveType']),
        );
    }

    public function attachment(Request $request, LeaveApplication $leaveApplication): StreamedResponse
    {
        $this->ensureCanView($request, $leaveApplication);
        abort_unless($leaveApplication->attachment_path && Storage::disk('local')->exists($leaveApplication->attachment_path), 404);

        return Storage::disk('local')->download($leaveApplication->attachment_path);
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
        $ownEmp = $user->employeeRecord();
        if ($ownEmp && $leave->employee_id === $ownEmp->id) {
            abort(403, 'You cannot approve your own leave.');
        }

        if ($user->can('leave.approve.any')) {
            return;
        }

        if ($user->can('leave.approve.self_dept')) {
            $approverEmp = $ownEmp?->id;
            // An approver with no employee record can't be anyone's manager/dept head.
            if (! $approverEmp) {
                abort(403, 'You do not have permission to act on this request.');
            }
            // Resolve the subject without the company scope so a cross-company
            // supervisor (their employee record sits in another company) still matches.
            $subj = \App\Domain\HRIS\Models\Employee::withoutGlobalScopes()
                ->where('id', $leave->employee_id)->first(['id', 'manager_employee_id', 'department_id']);
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
