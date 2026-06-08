<?php

namespace App\Http\Controllers\Concerns;

use App\Domain\HRIS\Models\Employee;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
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
     * Apply ownership scope to listing queries for non-viewers.
     * Returns the (possibly-scoped) query.
     */
    protected function applyListingScope(Builder $query, Request $request): Builder
    {
        if ($request->user()->can('attendance.view')) {
            return $query; // CompanyScope handles tenant; nothing more to apply
        }

        $employee = $request->user()->employee;
        if (! $employee) {
            abort(403, 'You are not linked to an employee record.');
        }

        return $query->where('employee_id', $employee->id);
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
