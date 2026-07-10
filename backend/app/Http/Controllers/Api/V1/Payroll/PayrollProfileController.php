<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayrollProfileController extends Controller
{
    public function show(Request $request, Employee $employee): JsonResponse
    {
        abort_unless(
            $request->user()->can('compensation.view') || $request->user()->can('payroll.view'),
            403,
        );

        return response()->json(['data' => $employee->payrollProfile]);
    }

    /** One profile per employee; upsert rather than create duplicates. */
    public function upsert(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('compensation.manage'), 403);

        $data = $request->validate([
            'work_days_per_year' => ['nullable', 'integer', 'min:1', 'max:366'],
            'cost_center' => ['nullable', 'string', 'max:100'],
            'is_rohq' => ['sometimes', 'boolean'],

            'is_minimum_wage_earner' => ['sometimes', 'boolean'],
            'daily_allowance' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'de_minimis' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'pay_group' => ['nullable', 'string', 'max:60'],
            'consultant_percent_tax' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'work_hours_per_day' => ['nullable', 'numeric', 'min:0', 'max:24'],
            'ot_computation_table' => ['nullable', 'string', 'max:60'],

            'sss_contribution_mode' => ['nullable', 'string', 'in:system,fixed'],
            'sss_fixed_amount' => ['nullable', 'numeric', 'min:0', 'required_if:sss_contribution_mode,fixed'],
            'hdmf_contribution_mode' => ['nullable', 'string', 'in:system,fixed'],
            'hdmf_additional' => ['nullable', 'numeric', 'min:0'],
            'philhealth_contribution_mode' => ['nullable', 'string', 'in:system,fixed'],
            'philhealth_fixed_amount' => ['nullable', 'numeric', 'min:0', 'required_if:philhealth_contribution_mode,fixed'],

            'has_previous_employment' => ['sometimes', 'boolean'],
            'prev_nontax_13th_month' => ['nullable', 'numeric', 'min:0'],
            'prev_nontax_other_bonus' => ['nullable', 'numeric', 'min:0'],
            'prev_nontax_salaries' => ['nullable', 'numeric', 'min:0'],
            'prev_13th_month' => ['nullable', 'numeric', 'min:0'],
            'prev_other_bonus' => ['nullable', 'numeric', 'min:0'],
            'prev_taxable_gross' => ['nullable', 'numeric', 'min:0'],
            'prev_tax_withheld' => ['nullable', 'numeric', 'min:0'],
            'prev_government_deductions' => ['nullable', 'numeric', 'min:0'],
            'prev_de_minimis' => ['nullable', 'numeric', 'min:0'],
            'prev_taxable_compensation' => ['nullable', 'numeric', 'min:0'],
            'prev_monetized_leave' => ['nullable', 'numeric', 'min:0'],
        ]);

        $profile = $employee->payrollProfile()->updateOrCreate(
            ['employee_id' => $employee->id],
            $data,
        );

        return response()->json(['message' => 'Payroll profile saved.', 'data' => $profile], 200);
    }
}
