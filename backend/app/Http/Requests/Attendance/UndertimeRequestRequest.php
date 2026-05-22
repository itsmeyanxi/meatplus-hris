<?php

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UndertimeRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Self-service: anyone authenticated with an employee link, or a manager,
        // may attempt to file. Controller enforces ownership rules afterwards.
        $user = $this->user();
        return $user && ($user->can('attendance.manage') || $user->employee);
    }

    public function rules(): array
    {
        $companyId = $this->user()->active_company_id;
        $isManager = $this->user()->can('attendance.manage');

        return [
            'employee_id' => [
                $isManager ? 'required' : 'nullable',
                'integer',
                Rule::exists('employees', 'id')->where('company_id', $companyId),
            ],
            'date' => ['required', 'date'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i', 'after:start_time'],
            'requested_hours' => ['required', 'numeric', 'min:0.25', 'max:24'],
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
