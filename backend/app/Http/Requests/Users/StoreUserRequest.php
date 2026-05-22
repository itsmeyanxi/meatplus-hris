<?php

namespace App\Http\Requests\Users;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('user.manage') ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:8', 'max:64'],
            'role' => ['required', 'string', Rule::in([
                'super_admin', 'hr_admin', 'hr_manager', 'payroll_officer', 'dept_head', 'employee',
            ])],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')
                ->where('company_id', $this->user()->active_company_id)],
        ];
    }
}
