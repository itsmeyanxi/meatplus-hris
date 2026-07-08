<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;

class BankAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'bank_name' => [$req, 'string', 'max:100'],
            'account_number' => [$req, 'string', 'max:60'],
            'account_name' => [$req, 'string', 'max:150'],
            'is_primary' => ['sometimes', 'boolean'],
            'purpose' => ['sometimes', 'string', 'in:payroll,savings,others'],
        ];
    }
}
