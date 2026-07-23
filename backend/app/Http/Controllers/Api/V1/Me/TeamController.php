<?php

namespace App\Http\Controllers\Api\V1\Me;

use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in user's team view. Everyone with an employee profile sees
 * something here:
 *   - manager : who they report to (if any)
 *   - reports : their direct reports (the manager/supervisor view)
 *   - peers   : teammates who report to the same manager
 *
 * Reporting is a personal relationship, so this deliberately IGNORES the
 * company scope: an org-wide manager (e.g. the IT head) can have reports in
 * several companies and should see them all from one login, no matter which
 * company is currently active.
 */
class TeamController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $me = Employee::withoutGlobalScopes()
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $me) {
            return response()->json(['data' => ['manager' => null, 'reports' => [], 'peers' => []]]);
        }

        $with = ['position:id,title', 'department:id,name', 'company:id,code,trade_name'];
        $map = fn (Employee $e) => [
            'id' => $e->id,
            'employee_no' => $e->employee_no,
            'full_name' => trim(($e->first_name ?? '').' '.($e->last_name ?? '')),
            'position' => $e->position?->title,
            'department' => $e->department?->name,
            'company' => $e->company?->code ?? $e->company?->trade_name,
            'is_active' => $e->is_active,
        ];

        // People who report to me.
        $reports = Employee::withoutGlobalScopes()
            ->where('manager_employee_id', $me->id)
            ->with($with)
            ->orderBy('company_id')->orderBy('last_name')->orderBy('first_name')
            ->get()->map($map)->values();

        // Who I report to, and the teammates I share that manager with.
        $manager = null;
        $peers = collect();
        if ($me->manager_employee_id) {
            $mgr = Employee::withoutGlobalScopes()->with($with)->find($me->manager_employee_id);
            $manager = $mgr ? $map($mgr) : null;

            $peers = Employee::withoutGlobalScopes()
                ->where('manager_employee_id', $me->manager_employee_id)
                ->where('id', '<>', $me->id)
                ->with($with)
                ->orderBy('company_id')->orderBy('last_name')->orderBy('first_name')
                ->get()->map($map)->values();
        }

        return response()->json(['data' => [
            'manager' => $manager,
            'reports' => $reports,
            'peers' => $peers,
        ]]);
    }
}
