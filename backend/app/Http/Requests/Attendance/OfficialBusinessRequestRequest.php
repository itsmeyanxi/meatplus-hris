<?php

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class OfficialBusinessRequestRequest extends FormRequest
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
            'date'       => ['required', 'date'],
            'date_to'    => ['nullable', 'date', 'after_or_equal:date'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time'   => ['nullable', 'date_format:H:i', 'after:start_time'],
            'location'   => ['required', 'string', 'max:200'],
            'purpose'    => ['required', 'string', 'max:1000'],
        ];
    }
}
