<?php

namespace App\Http\Controllers\Api\V1\Leave;

use App\Domain\Leave\Models\LeaveBalance;
use App\Domain\Leave\Models\LeaveType;
use App\Domain\Leave\Services\LeaveBalanceService;
use App\Http\Controllers\Controller;
use App\Http\Resources\Leave\LeaveBalanceResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class LeaveBalanceController extends Controller
{
    public function index(Request $request, LeaveBalanceService $service): AnonymousResourceCollection
    {
        $user = $request->user();
        $year = (int) ($request->query('year') ?: now()->year);
        $companyId = $user->active_company_id;

        // Scope: non-viewers see only their own balances
        $employeeIds = null;
        if (! $user->can('leave.view')) {
            $employeeIds = $user->employee ? [$user->employee->id] : [];
        } elseif ($eid = $request->query('employee_id')) {
            $employeeIds = [(int) $eid];
        }

        // Materialize a balance row for every (employee × active leave type) so the UI shows zero-balance entries too
        if ($employeeIds) {
            $types = LeaveType::query()->where('is_active', true)->get();
            foreach ($employeeIds as $eid) {
                $employee = \App\Domain\HRIS\Models\Employee::find($eid);
                if (! $employee) continue;
                foreach ($types as $t) {
                    $service->ensureBalance($employee, $t, $year);
                }
            }
        }

        $q = LeaveBalance::query()
            ->with(['employee:id,employee_no,first_name,last_name,company_id', 'leaveType:id,code,name'])
            ->where('year', $year)
            ->whereHas('employee', fn ($w) => $w->where('company_id', $companyId));

        if ($employeeIds !== null) {
            $q->whereIn('employee_id', $employeeIds);
        }

        return LeaveBalanceResource::collection(
            $q->orderBy('employee_id')->orderBy('leave_type_id')->get(),
        );
    }
}
