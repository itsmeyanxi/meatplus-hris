<?php

namespace App\Http\Controllers\Concerns;

use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use App\Models\User;
use App\Notifications\AttendanceRequestAwaitingApproval;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

/**
 * Shared self-service + approver-scope logic for attendance approval workflows.
 *
 * Used by controllers managing OT, UT, OB, COA, and AttendanceCorrection requests.
 *
 * Rules:
 * - Filing:    `attendance.manage` may file for any employee; otherwise the requester's
 *              linked Employee filing for self (employee_id derived from auth).
 * - Listing:   `attendance.view` sees all in company; otherwise sees own requests only.
 * - Approving: `attendance.manage` may approve any; `attendance.approve.self_dept`
 *              (dept_head) may approve direct reports or members of departments they head;
 *              nobody can approve their OWN request.
 * - Cancelling: `attendance.manage` may cancel any pending; otherwise the requester may
 *              cancel their own pending only.
 */
trait HandlesApprovalWorkflow
{
    /**
     * Apply ownership scope to listing queries.
     *
     * - attendance.view.any / attendance.manage → HR/IT: see all company requests
     * - attendance.approve.*                    → Dept heads: see own + direct reports + dept members
     * - otherwise                               → Employees: own requests only
     */
    protected function applyListingScope(Builder $query, Request $request): Builder
    {
        $user = $request->user();

        if ($user->can('attendance.view.any') || $user->can('attendance.manage')) {
            return $query;
        }

        $employee = $user->employee;
        if (! $employee) {
            abort(403, 'You are not linked to an employee record.');
        }

        // Dept heads / approvers see requests within their department scope.
        if ($user->can('attendance.approve.self_dept') || $user->can('attendance.approve.any')) {
            $approverEmpId = $employee->id;

            return $query->where(function (Builder $q) use ($approverEmpId) {
                $q->where('employee_id', $approverEmpId)
                  ->orWhereHas('employee', function (Builder $eq) use ($approverEmpId) {
                      $eq->where('manager_employee_id', $approverEmpId)
                         ->orWhereHas('department', function (Builder $dq) use ($approverEmpId) {
                             $dq->where('head_employee_id', $approverEmpId);
                         });
                  });
            });
        }

        return $query->where('employee_id', $employee->id);
    }

    /**
     * Throw 403 if the current user may not VIEW this single request.
     *
     * - HR/IT: allowed for any company record
     * - Dept heads: allowed for their own or within their approval scope
     * - Everyone else: own record only
     */
    protected function assertCanView(Request $request, Model $model): void
    {
        $user = $request->user();

        if ($user->can('attendance.view.any') || $user->can('attendance.manage')) {
            return;
        }

        $employee = $user->employee;

        if ($employee && $model->employee_id === $employee->id) {
            return;
        }

        if (($user->can('attendance.approve.self_dept') || $user->can('attendance.approve.any'))
            && $this->isWithinApproverScope($user, $model)) {
            return;
        }

        abort(403, 'You do not have permission to view this request.');
    }

    /**
     * Resolve the effective employee_id when storing a new request.
     * Managers may submit any employee_id; others are forced to self.
     */
    protected function resolveEmployeeIdForStore(Request $request, array $validated): int
    {
        if ($request->user()->can('attendance.manage') && isset($validated['employee_id'])) {
            return (int) $validated['employee_id'];
        }

        $employee = $request->user()->employee;
        if (! $employee) {
            abort(403, 'You are not linked to an employee record. Ask HR to provision your access.');
        }

        return $employee->id;
    }

    /**
     * Whether the request payload should require employee_id from clients.
     * Managers must specify it; self-service users will have it derived.
     */
    protected function shouldRequireEmployeeIdInPayload(Request $request): bool
    {
        return $request->user()->can('attendance.manage');
    }

    /**
     * Throw 403/422 if the current user cannot approve/reject this model.
     */
    protected function assertCanDecide(Request $request, Model $model): void
    {
        if ($model->status !== 'pending') {
            throw ValidationException::withMessages([
                'status' => "Cannot act on a request that is already {$model->status}.",
            ]);
        }

        $user = $request->user();

        // Approving own request is never allowed.
        if ($user->employee && $model->employee_id === $user->employee->id) {
            abort(403, 'You cannot approve your own request.');
        }

        // dept_head approves attendance requests (role-based, any), mirroring leaves.
        if ($user->can('attendance.approve.any')) {
            return;
        }

        if ($user->can('attendance.approve.self_dept')
            && $this->isWithinApproverScope($user, $model)) {
            return;
        }

        abort(403, 'You do not have permission to act on this request.');
    }

    /**
     * Throw 403/422 if the current user cannot cancel this model.
     * Managers may cancel any pending; the requester may cancel their own pending.
     */
    protected function assertCanCancel(Request $request, Model $model): void
    {
        if ($model->status !== 'pending') {
            throw ValidationException::withMessages([
                'status' => "Cannot act on a request that is already {$model->status}.",
            ]);
        }

        $user = $request->user();
        if ($user->can('attendance.manage')) {
            return;
        }

        if ($user->employee && $model->employee_id === $user->employee->id) {
            return;
        }

        abort(403, 'You do not have permission to cancel this request.');
    }

    /**
     * Recompute the DTR for the day(s) a decided request covers, so an approval is
     * reflected in attendance immediately instead of waiting for the next sync.
     * Handles both `work_date` (COA, correction) and `date`/`date_to` (OT, OB, UT).
     * Never let a recompute failure break the approval itself.
     */
    protected function recomputeRequestDays(Model $model): void
    {
        try {
            $start = $model->work_date ?? $model->date ?? null;
            if (! $start) {
                return;
            }
            $end = $model->date_to ?? $start;

            $employee = $model->employee ?? Employee::withoutGlobalScopes()->find($model->employee_id);
            if (! $employee) {
                return;
            }

            app(DtrComputer::class)->computeForEmployee(
                $employee,
                CarbonImmutable::parse($start),
                CarbonImmutable::parse($end),
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * Notify everyone who can act on a freshly-filed attendance request: the
     * subject's direct manager, their department head, and the global attendance
     * approvers (holders of attendance.approve.any / attendance.manage). The
     * manager and head are resolved without the company scope, so a cross-company
     * manager (e.g. the IT head) is reached no matter which company they sit in.
     * The filer never notifies themselves. Failures here must never break filing.
     */
    protected function notifyAttendanceApprovers(Model $model, string $kind, string $url): void
    {
        try {
            $subject = Employee::withoutGlobalScopes()
                ->where('id', $model->employee_id)
                ->with('department:id,head_employee_id')
                ->first(['id', 'user_id', 'manager_employee_id', 'department_id', 'first_name', 'last_name']);
            if (! $subject) {
                return;
            }

            $recipientIds = collect();

            foreach ([$subject->manager_employee_id, $subject->department?->head_employee_id] as $empId) {
                if ($empId) {
                    $uid = Employee::withoutGlobalScopes()->where('id', $empId)->value('user_id');
                    if ($uid) {
                        $recipientIds->push($uid);
                    }
                }
            }

            // Global approvers: any user whose roles grant blanket attendance approval.
            $roleIds = DB::table('role_has_permissions as rp')
                ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
                ->whereIn('p.name', ['attendance.approve.any', 'attendance.manage'])
                ->pluck('rp.role_id');
            $roleUserIds = DB::table('model_has_roles')
                ->where('model_type', User::class)
                ->whereIn('role_id', $roleIds)
                ->pluck('model_id');

            $filerId = $model->filed_by_user_id ?? $subject->user_id;
            $users = User::whereIn('id', $recipientIds->merge($roleUserIds)->unique()->filter()->values())
                ->where('is_active', true)
                ->when($filerId, fn ($q) => $q->where('id', '!=', $filerId))
                ->get();

            // Different request types name their date column differently
            // (COA/correction: work_date; OT/OB/UT: date).
            $dateVal = $model->work_date ?? $model->date ?? null;
            $dateStr = $dateVal instanceof \DateTimeInterface
                ? $dateVal->format('Y-m-d')
                : ($dateVal ? (string) $dateVal : null);

            if ($users->isNotEmpty()) {
                Notification::send($users, new AttendanceRequestAwaitingApproval(
                    $kind,
                    trim(($subject->first_name ?? '').' '.($subject->last_name ?? '')),
                    $dateStr,
                    $url,
                    $model->id,
                ));
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * Dept-head scope: the request belongs to an employee
     * (a) whose direct manager is the approver, OR
     * (b) who is in a department headed by the approver.
     */
    private function isWithinApproverScope(User $user, Model $model): bool
    {
        $approverEmployeeId = $user->employee?->id;
        if (! $approverEmployeeId) {
            return false;
        }

        $subject = Employee::query()
            ->where('id', $model->employee_id)
            ->with('department:id,head_employee_id')
            ->first(['id', 'manager_employee_id', 'department_id']);

        if (! $subject) {
            return false;
        }

        if ($subject->manager_employee_id === $approverEmployeeId) {
            return true;
        }

        if ($subject->department && $subject->department->head_employee_id === $approverEmployeeId) {
            return true;
        }

        return false;
    }
}
