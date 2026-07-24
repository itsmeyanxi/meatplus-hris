<?php

namespace App\Http\Requests\Users;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

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
            // 8-20 chars with at least one lowercase, uppercase, number and symbol.
            'password' => ['required', 'string', 'max:20', Password::min(8)->mixedCase()->numbers()->symbols()],
            'role' => ['required', 'string', Rule::in([
                'admin', 'hr_admin', 'hr_officer', 'it_admin', 'it_staff', 'payroll_officer', 'dept_head', 'employee',
                'supervisor', 'team_lead', 'dept_admin', 'transport_access',
                'sales_employee', 'timekeeper', 'hr_coordinator', 'garahe_teamlead',
            ]), $this->blockAdminEscalation()],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')
                ->where('company_id', $this->user()->active_company_id)],
        ];
    }

    private function blockAdminEscalation(): \Closure
    {
        return AdminRoleGuard::rule($this->user());
    }
}
