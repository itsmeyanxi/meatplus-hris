<?php

namespace App\Http\Requests\Leave;

use Illuminate\Foundation\Http\FormRequest;

class LeaveDecisionRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        // Leave approval is reserved for leave approvers (dept_head).
        // The stage/relationship check happens in the controller.
        return $user !== null
            && ($user->can('leave.approve.any') || $user->can('leave.approve.self_dept'));
    }

    public function rules(): array
    {
        return [
            'decision_remarks' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
