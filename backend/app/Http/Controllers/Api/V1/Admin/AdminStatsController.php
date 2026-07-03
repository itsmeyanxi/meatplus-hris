<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\HRIS\Models\Employee;
use App\Domain\Leave\Models\LeaveApplication;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminStatsController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('employee.view'), 403);

        $companyId = $request->user()->active_company_id;

        $base = Employee::query()
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->where('is_active', true);

        $headcount = (clone $base)->count();

        $noAccess = (clone $base)->whereNull('user_id')->count();

        $pendingLeaves = LeaveApplication::query()
            ->whereHas('employee', fn ($q) => $q
                ->where('is_active', true)
                ->when($companyId, fn ($q2) => $q2->where('company_id', $companyId))
            )
            ->where('status', 'pending')
            ->count();

        $todayPresent = DailyTimeRecord::query()
            ->whereHas('employee', fn ($q) => $q
                ->where('is_active', true)
                ->when($companyId, fn ($q2) => $q2->where('company_id', $companyId))
            )
            ->whereDate('work_date', today())
            ->whereNotNull('actual_in')
            ->where('is_absent', false)
            ->where('is_on_leave', false)
            ->count();

        return response()->json([
            'headcount'      => $headcount,
            'no_access'      => $noAccess,
            'pending_leaves' => $pendingLeaves,
            'today_present'  => $todayPresent,
        ]);
    }
}
