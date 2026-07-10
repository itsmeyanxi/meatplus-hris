<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;

class GovernmentIdRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    public function rules(): array
    {
        return [
            'tin' => ['nullable', 'string', 'max:20'],
            'sss_no' => ['nullable', 'string', 'max:30'],
            'philhealth_no' => ['nullable', 'string', 'max:30'],
            'pagibig_no' => ['nullable', 'string', 'max:30'],
            'prc_no' => ['nullable', 'string', 'max:50'],
            'prc_expiry' => ['nullable', 'date'],
            'passport_no' => ['nullable', 'string', 'max:30'],
            'rdo_code' => ['nullable', 'string', 'max:10'],
        ];
    }
}
