<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\EmployeePayrollProfile;
use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\CompensationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CompensationController extends Controller
{
    /** List employees with their current monthly compensation (for the payroll setup grid). */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('compensation.view') || $user->can('payroll.view'), 403);

        // Confidential employees' pay is visible only to hr_confi (the sensitive
        // permission) or the company `admin` role — everyone else never sees a
        // confidential row here at all. Filtered in the query, not just hidden in
        // the UI, so the pay figures never leave the server for the wrong viewer.
        $canSeeConfidential = $this->canSeeConfidential($request);

        $employees = Employee::query()
            ->where('is_active', true)
            ->when(! $canSeeConfidential, fn ($q) => $q->where('is_confidential', false))
            ->with(['department:id,name', 'compensation', 'payrollProfile'])
            ->orderBy('last_name')->orderBy('first_name')
            ->get()
            ->map(fn (Employee $e) => [
                'employee_id' => $e->id,
                'employee_no' => $e->employee_no,
                'name' => $e->full_name,
                'department' => $e->department?->name,
                'is_confidential' => (bool) $e->is_confidential,
                'basic_monthly' => $e->compensation?->basic_monthly,
                'pay_type' => $e->compensation?->pay_type ?? 'monthly',
                'daily_rate' => $e->compensation?->daily_rate,
                // "Non-Taxable Allowance" in the UI — the compensation record's allowance.
                'allowance_monthly' => $e->compensation?->allowance_monthly,
                // De minimis (paid, tax-exempt) and Fleet Card (tracked only, NOT paid)
                // both live on the payroll profile.
                'de_minimis' => $e->payrollProfile?->de_minimis,
                'fleet_card' => $e->payrollProfile?->fleet_card,
                'has_compensation' => (bool) $e->compensation,
            ]);

        return response()->json([
            'data' => $employees,
            'can_see_confidential' => $canSeeConfidential,
        ]);
    }

    /**
     * May this user see confidential employees' compensation? Reserved for the
     * hr_confi role (employee.view.sensitive) plus the company `admin` role — this
     * page's deliberate exception to hr_confi being the sole holder elsewhere.
     */
    private function canSeeConfidential(Request $request): bool
    {
        $user = $request->user();

        return $user->can('employee.view.sensitive') || $user->hasRole('admin');
    }

    /**
     * Record a new salary for an employee.
     *
     * This used to updateOrCreate on employee_id, overwriting the previous figure —
     * so there was never any history, despite the effective_from / is_active columns.
     * It now closes the outgoing record and appends a new one, which is what a salary
     * history means and what Employee::compensation() selects from.
     */
    public function store(CompensationRequest $request): JsonResponse
    {
        $data = $request->validated();

        // A confidential employee's pay can only be set by someone allowed to see
        // it — otherwise the confidential wall could be bypassed by POSTing an id.
        if (! $this->canSeeConfidential($request)) {
            $target = Employee::query()->find($data['employee_id']);
            abort_if($target?->is_confidential, 403, 'You are not allowed to set this employee\'s compensation.');
        }

        $comp = DB::transaction(function () use ($request, $data) {
            EmployeeCompensation::query()
                ->where('employee_id', $data['employee_id'])
                ->where('is_active', true)
                ->update(['is_active' => false]);

            $payType = $data['pay_type'] ?? 'monthly';
            $dailyRate = $payType === 'daily' ? ($data['daily_rate'] ?? null) : null;
            // Keep basic_monthly meaningful: for daily-paid staff store the monthly
            // equivalent (rate × 22) when not given, so reports/displays still show a figure.
            $basicMonthly = $data['basic_monthly'] ?? ($dailyRate !== null ? round((float) $dailyRate * 22, 2) : null);

            $comp = EmployeeCompensation::create([
                'employee_id' => $data['employee_id'],
                'company_id' => $request->user()->active_company_id,
                'pay_type' => $payType,
                'daily_rate' => $dailyRate,
                'basic_monthly' => $basicMonthly,
                'allowance_monthly' => $data['allowance_monthly'] ?? 0,
                'effective_from' => $data['effective_from'] ?? null,
                'is_active' => true,
            ]);

            // De minimis (paid, tax-exempt) and Fleet Card (tracked only, never paid)
            // live on the payroll profile, not the versioned compensation row. Upsert
            // just those keys so the rest of the profile is left untouched.
            $profileFields = array_intersect_key($data, array_flip(['de_minimis', 'fleet_card']));
            if ($profileFields) {
                EmployeePayrollProfile::updateOrCreate(
                    ['employee_id' => $data['employee_id']],
                    $profileFields,
                );
            }

            return $comp;
        });

        return response()->json([
            'message' => 'Compensation saved.',
            'data' => [
                'employee_id' => $comp->employee_id,
                'basic_monthly' => $comp->basic_monthly,
                'allowance_monthly' => $comp->allowance_monthly,
            ],
        ]);
    }

    /** Salary history for one employee, newest first. */
    public function history(Request $request, Employee $employee): JsonResponse
    {
        abort_unless(
            $request->user()->can('compensation.view') || $request->user()->can('payroll.view'),
            403,
        );

        // Don't leak a confidential employee's salary history to a viewer who
        // isn't allowed to see confidential pay.
        abort_if($employee->is_confidential && ! $this->canSeeConfidential($request), 403);

        return response()->json([
            'data' => $employee->compensations()->get()->map(fn (EmployeeCompensation $c) => [
                'id' => $c->id,
                'basic_monthly' => $c->basic_monthly,
                'allowance_monthly' => $c->allowance_monthly,
                'effective_from' => $c->effective_from?->toDateString(),
                'is_active' => $c->is_active,
            ]),
        ]);
    }

    public function destroy(Request $request, Employee $employee, EmployeeCompensation $compensation): JsonResponse
    {
        abort_unless($request->user()->can('compensation.manage'), 403);
        abort_unless($compensation->employee_id === $employee->id, 404);

        $wasActive = $compensation->is_active;
        $compensation->delete();

        // Never leave an employee without a current salary while history remains.
        if ($wasActive && ($next = $employee->compensations()->first())) {
            $next->update(['is_active' => true]);
        }

        return response()->json(['message' => 'Salary record removed.']);
    }
}
