<?php

namespace App\Http\Requests\Leave;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreLeaveApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        return $user && ($user->can('leave.approve.any') || $user->can('leave.file') || $user->employee);
    }

    public function rules(): array
    {
        $companyId = $this->user()->active_company_id;
        $isManager = $this->user()->can('leave.approve.any');

        return [
            'employee_id' => [
                $isManager ? 'required' : 'nullable',
                'integer',
                Rule::exists('employees', 'id')->where('company_id', $companyId),
            ],
            'leave_type_id' => ['required', 'integer',
                Rule::exists('leave_types', 'id')->where('company_id', $companyId)],
            'date_from' => ['required', 'date'],
            'date_to' => ['required', 'date', 'after_or_equal:date_from'],
            'half_day'   => ['nullable', 'string', 'in:am,pm'],
            // Paid ("paid leave") vs unpaid ("just leave"). Optional — defaults to
            // the leave type's is_paid in the controller when omitted.
            'is_paid'    => ['nullable', 'boolean'],
            'reason'     => ['required', 'string', 'max:1000'],
            'attachment' => ['nullable', 'file', 'max:5120', 'mimes:jpg,jpeg,png,pdf,doc,docx'],
        ];
    }
}
