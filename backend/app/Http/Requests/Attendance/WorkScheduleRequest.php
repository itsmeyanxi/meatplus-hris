<?php

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class WorkScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('attendance.manage') ?? false;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';
        $companyId = $this->user()->active_company_id;
        $scheduleId = $this->route('work_schedule')?->id;

        return [
            'code' => [
                $req, 'string', 'max:30',
                Rule::unique('work_schedules', 'code')->where('company_id', $companyId)->ignore($scheduleId),
            ],
            'name' => [$req, 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_flexible' => ['sometimes', 'boolean'],
            'breaks_paid' => ['sometimes', 'boolean'],
            'weekly_workdays' => ['sometimes', 'integer', 'min:1', 'max:7'],
            'is_active' => ['sometimes', 'boolean'],

            'days' => ['sometimes', 'array', 'size:7'],
            'days.*.day_of_week' => ['required_with:days', 'integer', 'between:0,6'],
            'days.*.is_rest_day' => ['sometimes', 'boolean'],
            'days.*.time_in' => ['nullable', 'date_format:H:i:s'],
            'days.*.time_out' => ['nullable', 'date_format:H:i:s'],
            'days.*.break_minutes' => ['sometimes', 'integer', 'min:0', 'max:480'],
            'days.*.required_hours' => ['sometimes', 'numeric', 'min:0', 'max:24'],
        ];
    }
}
