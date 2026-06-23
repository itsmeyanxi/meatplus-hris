<?php

namespace App\Http\Requests\AccessControl;

use Illuminate\Foundation\Http\FormRequest;

class StoreAccessRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Department heads, HR and IT admins, and regular employees may submit.
        return $this->user()?->hasAnyRole(['dept_head', 'hr_admin', 'it_admin', 'employee']) ?? false;
    }

    public function rules(): array
    {
        return [
            'request_type' => ['required', 'string', 'in:new_access,access_modification,access_removal,temporary_access'],
            'effective_date' => ['required', 'date'],
            'ticket_number' => ['nullable', 'string', 'max:100'],

            'employee_name' => ['required', 'string', 'max:255'],
            'employee_id_number' => ['required', 'string', 'max:100'],
            'position' => ['required', 'string', 'max:255'],
            'department' => ['required', 'string', 'max:255'],
            'employment_status' => ['required', 'string', 'in:regular,probationary,contractual,ojt_intern'],
            'immediate_supervisor' => ['required', 'string', 'max:255'],
            'company_email' => ['required', 'email', 'max:255'],
            'contact_number' => ['required', 'string', 'max:50'],

            'justification' => ['required', 'string', 'max:2000'],

            // modules: { ess: ["view","user"], payroll: ["admin"], ... }
            'modules' => ['array'],
            'modules.*' => ['array'],
            'modules.*.*' => ['string', 'in:view,user,approver,admin'],
        ];
    }
}
