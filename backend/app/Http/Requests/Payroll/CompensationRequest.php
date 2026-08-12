<?php

namespace App\Http\Requests\Payroll;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CompensationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('compensation.manage') ?? false;
    }

    public function rules(): array
    {
        $companyId = $this->user()->active_company_id;

        return [
            'employee_id' => ['required', 'integer',
                Rule::exists('employees', 'id')->where('company_id', $companyId)],
            'pay_type' => ['nullable', 'in:monthly,daily'],
            'basic_monthly' => ['required_without:daily_rate', 'nullable', 'numeric', 'min:0', 'max:99999999'],
            'daily_rate' => ['required_if:pay_type,daily', 'nullable', 'numeric', 'min:0', 'max:99999999'],
            'allowance_monthly' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            // De minimis (paid, tax-exempt) and Fleet Card (tracked only) — saved to
            // the payroll profile alongside the salary record.
            'de_minimis' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'fleet_card' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'effective_from' => ['nullable', 'date'],
        ];
    }
}
