<?php

namespace App\Http\Requests\Attendance;

use App\Domain\Attendance\Services\AttendanceCorrectionApplier;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AttendanceCorrectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('attendance.correct') ?? false;
    }

    public function rules(): array
    {
        $companyId = $this->user()->active_company_id;

        return [
            'employee_id' => ['required', 'integer',
                Rule::exists('employees', 'id')->where('company_id', $companyId)],
            'work_date' => ['required', 'date'],
            'field_to_correct' => ['required', 'string', Rule::in(AttendanceCorrectionApplier::CORRECTABLE_FIELDS)],
            'old_value' => ['nullable', 'string', 'max:100'],
            'new_value' => ['required', 'string', 'max:100'],
            'reason' => ['required', 'string', 'max:1000'],
        ];
    }
}
