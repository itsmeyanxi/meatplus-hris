<?php

namespace App\Http\Requests\Users;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('user.manage') ?? false;
    }

    public function rules(): array
    {
        $userId = $this->route('user')?->id;

        return [
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($userId)],
            'is_active' => ['sometimes', 'boolean'],
            'roles'   => ['sometimes', 'array', 'min:1'],
            'roles.*' => ['string', Rule::in([
                'hr_admin', 'hr_officer', 'it_admin', 'it_staff', 'payroll_officer', 'dept_head', 'employee',
                'supervisor', 'team_lead', 'dept_admin', 'transport_access',
                'sales_employee', 'timekeeper', 'hr_coordinator', 'garahe_teamlead',
            ]), AdminRoleGuard::rule($this->user())],
        ];
    }
}
