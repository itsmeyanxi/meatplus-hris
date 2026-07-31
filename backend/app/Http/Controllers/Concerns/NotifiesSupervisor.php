<?php

namespace App\Http\Controllers\Concerns;

use App\Domain\HRIS\Models\Employee;
use App\Models\User;
use App\Notifications\SupervisorApprovalReminder;
use Illuminate\Http\JsonResponse;

/**
 * Shared "Notify supervisor" action for leave / COA requests. Resolves the
 * subject employee's DEDICATED supervisor (manager_employee_id) and pings just
 * that person to approve — so approval is routed to the right supervisor rather
 * than done by whoever happens to be looking (HR/admin).
 */
trait NotifiesSupervisor
{
    protected function pingSupervisor(int $employeeId, string $kind, ?string $date, string $url, int $requestId): JsonResponse
    {
        $employee = Employee::withoutGlobalScopes()->find($employeeId, ['id', 'first_name', 'last_name', 'manager_employee_id']);
        if (! $employee) {
            abort(404, 'Employee not found.');
        }

        $name = trim($employee->first_name.' '.$employee->last_name);

        if (! $employee->manager_employee_id) {
            return response()->json(['message' => "{$name} has no supervisor assigned yet. Set their supervisor on the employee profile first."], 422);
        }

        $supervisor = Employee::withoutGlobalScopes()->find($employee->manager_employee_id, ['id', 'first_name', 'last_name', 'user_id']);
        if (! $supervisor || ! $supervisor->user_id) {
            return response()->json(['message' => "{$name}'s supervisor has no user account to notify."], 422);
        }

        $supUser = User::where('id', $supervisor->user_id)->where('is_active', true)->first();
        if (! $supUser) {
            return response()->json(['message' => "{$name}'s supervisor account is inactive."], 422);
        }

        $supUser->notify(new SupervisorApprovalReminder($kind, $name, $date, $url, $requestId));

        $supName = trim($supervisor->first_name.' '.$supervisor->last_name);

        return response()->json(['message' => "Notified {$supName} (supervisor) to review this {$kind} request."]);
    }
}
