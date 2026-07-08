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
    public function adjust(Request $request, LeaveBalance $leaveBalance): LeaveBalanceResource
    {
        abort_unless($request->user()->can('leave.approve.any'), 403);
        abort_unless(
            $leaveBalance->employee->company_id === $request->user()->active_company_id,
            403,
        );

        $validated = $request->validate([
            'adjustment' => ['required', 'numeric'],
            'note'       => ['required', 'string', 'max:500'],
        ]);

        $leaveBalance->increment('granted_adhoc', (float) $validated['adjustment']);
        $leaveBalance->refresh();
        $leaveBalance->load(['employee:id,employee_no,first_name,last_name,company_id', 'leaveType:id,code,name']);

        return new LeaveBalanceResource($leaveBalance);
    }

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
            ->whereHas('employee', fn ($w) => $w->where('company_id', $companyId))
            // Only surface balances for currently-offered leave types; retired types stay hidden.
            ->whereHas('leaveType', fn ($w) => $w->where('is_active', true));

        if ($employeeIds !== null) {
            $q->whereIn('employee_id', $employeeIds);
        }

        return LeaveBalanceResource::collection(
            $q->orderBy('employee_id')->orderBy('leave_type_id')->get(),
        );
    }
}
