<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;

class EmploymentHistoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'company_name' => [$req, 'string', 'max:200'],
            'position' => [$req, 'string', 'max:200'],
            'from_date' => [$req, 'date'],
            'to_date' => ['nullable', 'date', 'after_or_equal:from_date'],
            'reason_for_leaving' => ['nullable', 'string', 'max:250'],
        ];
    }
}
