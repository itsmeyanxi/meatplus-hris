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
                'hr_admin', 'it_admin', 'payroll_officer', 'dept_head', 'employee',
                'supervisor', 'team_lead', 'dept_admin', 'transport_access',
                'sales_employee', 'timekeeper', 'hr_coordinator', 'garahe_teamlead',
            ]), $this->blockItAdminEscalation()],
            'employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')
                ->where('company_id', $this->user()->active_company_id)],
        ];
    }

    /**
     * Only an existing it_admin may grant the it_admin role — otherwise a
     * user.manage holder could escalate a new account to the top-level admin.
     */
    private function blockItAdminEscalation(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            if ($value === 'it_admin' && ! $this->user()?->hasRole('it_admin')) {
                $fail('You are not allowed to assign the it_admin role.');
            }
        };
    }
}
