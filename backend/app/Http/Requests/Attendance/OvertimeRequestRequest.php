<?php

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class OvertimeRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        return $user && ($user->can('attendance.manage') || $user->employee);
    }

    public function rules(): array
    {
        $companyId = $this->user()->active_company_id;

        return [
            // Optional — derived from the logged-in user's employee record when
            // omitted (self-service). Managers may pass another employee's id.
            'employee_id' => [
                'nullable',
                'integer',
                Rule::exists('employees', 'id')->where('company_id', $companyId),
            ],
            'date' => ['required', 'date'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i', 'after:start_time'],
            'requested_hours' => ['required', 'numeric', 'min:0.25', 'max:24'],
            'reason'         => ['required', 'string', 'max:1000'],
            'classification' => ['required', Rule::in(['early', 'normal'])],
            'ticket_number'  => ['nullable', 'string', 'max:100'],
            'attachment'     => ['nullable', 'file', 'max:5120', 'mimes:jpg,jpeg,png,pdf,doc,docx'],
        ];
    }
}
