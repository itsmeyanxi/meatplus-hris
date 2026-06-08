<?php

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;

class AttendanceDecisionRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        // Attendance-request approval is reserved for dept_head.
        // The per-request scope/state check happens in the controller (assertCanDecide).
        return $user !== null
            && ($user->can('attendance.approve.any') || $user->can('attendance.approve.self_dept'));
    }

    public function rules(): array
    {
        return [
            'decision_remarks' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
