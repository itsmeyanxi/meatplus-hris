<?php

namespace App\Http\Controllers\Api\V1\Me;

use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in user's team — their direct reports. This is the department
 * head / supervisor view; returns an empty list for accounts that manage no one.
 *
 * Direct reports are a personal relationship, so this deliberately IGNORES the
 * company scope: an org-wide manager (e.g. the IT head) can have reports in
 * several companies and should see all of them from one login, no matter which
 * company is currently active.
 */
class TeamController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        // The manager's own record may live in a different company than the one
        // they're currently viewing, so resolve it without the company scope.
        $employee = Employee::withoutGlobalScopes()
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $employee) {
            return response()->json(['data' => []]);
        }

        $reports = Employee::withoutGlobalScopes()
            ->where('manager_employee_id', $employee->id)
            ->with(['position:id,title', 'department:id,name', 'company:id,code,trade_name'])
            ->orderBy('company_id')
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get()
            ->map(fn (Employee $e) => [
                'id' => $e->id,
                'employee_no' => $e->employee_no,
                'full_name' => trim(($e->first_name ?? '').' '.($e->last_name ?? '')),
                'position' => $e->position?->title,
                'department' => $e->department?->name,
                'company' => $e->company?->code ?? $e->company?->trade_name,
                'is_active' => $e->is_active,
            ]);

        return response()->json(['data' => $reports]);
    }
}
