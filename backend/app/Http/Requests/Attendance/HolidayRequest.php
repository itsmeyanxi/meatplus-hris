<?php

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;

class HolidayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('attendance.manage') ?? false;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'holiday_date' => [$req, 'date'],
            'name' => [$req, 'string', 'max:150'],
            'type' => [$req, 'string', 'in:regular,special_non_working,special_working,local'],
            'applicable_branch_id' => ['nullable', 'integer', 'exists:branches,id'],
        ];
    }
}
