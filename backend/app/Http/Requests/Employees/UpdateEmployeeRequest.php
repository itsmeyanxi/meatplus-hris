<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateEmployeeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    public function rules(): array
    {
        $companyId = $this->user()->active_company_id;
        $employeeId = $this->route('employee')?->id;

        return [
            'employee_no' => [
                'sometimes', 'string', 'max:30',
                Rule::unique('employees', 'employee_no')
                    ->where('company_id', $companyId)
                    ->ignore($employeeId),
            ],
            // Biometric terminal "Employee No." — used to match device punches to this person.
            'biometric_user_id' => ['nullable', 'string', 'max:50'],
            'first_name' => ['sometimes', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'suffix' => ['nullable', 'string', 'max:20'],

            'birth_date' => ['sometimes', 'date', 'before:today'],
            'gender' => ['sometimes', 'string', 'in:male,female,other'],
            'civil_status' => ['sometimes', 'string', 'in:single,married,widowed,separated,divorced'],
            'nationality' => ['nullable', 'string', 'max:50'],
            'religion' => ['nullable', 'string', 'max:50'],

            'email_personal' => ['nullable', 'email', 'max:255'],
            'email_company' => ['nullable', 'email', 'max:255'],
            'mobile' => ['nullable', 'string', 'max:50'],
            'phone_home' => ['nullable', 'string', 'max:50'],

            'address_line1' => ['nullable', 'string', 'max:255'],
            'address_line2' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'province' => ['nullable', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:20'],
            'country' => ['nullable', 'string', 'max:100'],

            'branch_id' => ['sometimes', 'integer', Rule::exists('branches', 'id')->where('company_id', $companyId)],
            'department_id' => ['sometimes', 'integer', Rule::exists('departments', 'id')->where('company_id', $companyId)],
            'position_id' => ['sometimes', 'integer', Rule::exists('positions', 'id')->where('company_id', $companyId)],
            'employment_type_id' => ['sometimes', 'integer', Rule::exists('employment_types', 'id')
                ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $companyId))],
            'manager_employee_id' => ['nullable', 'integer', Rule::exists('employees', 'id')->where('company_id', $companyId)],

            'employee_type' => ['nullable', 'string', 'in:rank_and_file,supervisory,managerial,executive'],
            'user_type' => ['nullable', 'string', 'in:employee,manager,admin'],
            'job_code' => ['nullable', 'string', 'max:50'],
            'job_grade' => ['nullable', 'string', 'max:30'],
            'client_name' => ['nullable', 'string', 'max:150'],
            'billability' => ['nullable', 'string', 'in:billable,non_billable'],
            'designated_workplace' => ['nullable', 'string', 'max:150'],

            'date_hired' => ['sometimes', 'date'],
            'expected_regularization_date' => ['nullable', 'date'],
            'date_regularized' => ['nullable', 'date'],
            'date_separated' => ['nullable', 'date'],
            'separation_reason' => ['nullable', 'string', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}
