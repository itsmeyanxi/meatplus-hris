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
            'basic_monthly' => ['required', 'numeric', 'min:0', 'max:99999999'],
            'allowance_monthly' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'effective_from' => ['nullable', 'date'],
        ];
    }
}
