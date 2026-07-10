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

    /**
     * DtrComputer works from `break_minutes`, but the form captures a break window.
     * Derive the one from the other so both stay consistent, and never let an
     * explicit break_minutes disagree with the window that produced it.
     */
    protected function prepareForValidation(): void
    {
        $days = $this->input('days');
        if (! is_array($days)) {
            return;
        }

        foreach ($days as $i => $day) {
            $start = $day['break_start'] ?? null;
            $end = $day['break_end'] ?? null;

            if ($start && $end) {
                $minutes = (strtotime($end) - strtotime($start)) / 60;
                $days[$i]['break_minutes'] = max(0, (int) $minutes);
            }
        }

        $this->merge(['days' => $days]);
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';
        $companyId = $this->user()->active_company_id;
        $scheduleId = ($this->route('workSchedule') ?? $this->route('work_schedule'))?->id;

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
            'hours_per_day' => ['nullable', 'numeric', 'min:0', 'max:24'],
            'is_active' => ['sometimes', 'boolean'],

            'days' => ['sometimes', 'array', 'size:7'],
            'days.*.day_of_week' => ['required_with:days', 'integer', 'between:0,6'],
            'days.*.is_rest_day' => ['sometimes', 'boolean'],
            'days.*.time_in' => ['nullable', 'date_format:H:i:s'],
            'days.*.time_out' => ['nullable', 'date_format:H:i:s'],
            'days.*.break_start' => ['nullable', 'date_format:H:i:s'],
            'days.*.break_end' => ['nullable', 'date_format:H:i:s', 'after:days.*.break_start'],
            'days.*.break_minutes' => ['sometimes', 'integer', 'min:0', 'max:480'],
            'days.*.required_hours' => ['sometimes', 'numeric', 'min:0', 'max:24'],
        ];
    }
}
