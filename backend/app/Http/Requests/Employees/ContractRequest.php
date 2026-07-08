<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;

class ContractRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'contract_type' => [$req, 'string', 'max:50'],
            'effective_from' => [$req, 'date'],
            'effective_to' => ['nullable', 'date', 'after:effective_from'],
            'position_id' => [$req, 'exists:positions,id'],
            'monthly_rate' => [$req, 'numeric', 'min:0'],
        ];
    }
}
