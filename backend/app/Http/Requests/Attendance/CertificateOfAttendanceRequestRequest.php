<?php

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CertificateOfAttendanceRequestRequest extends FormRequest
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
            'work_date' => ['required', 'date'],
            'missed_punch' => ['required', 'string', 'in:in,out,both'],
            'claimed_time_in' => ['nullable', 'date_format:H:i'],
            'claimed_time_out' => ['nullable', 'date_format:H:i'],
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
