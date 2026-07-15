<?php

namespace App\Http\Requests\Attendance;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AttendanceDeviceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('device.manage') ?? false;
    }

    public function rules(): array
    {
        $isCreate = $this->isMethod('post');

        return [
            'name' => ['required', 'string', 'max:120'],
            'ip_address' => ['required', 'string', 'max:45'],
            'port' => ['nullable', 'integer', 'between:1,65535'],
            'timezone' => ['nullable', 'string', 'max:64', 'timezone'],
            'use_server_time' => ['boolean'],
            'username' => ['required', 'string', 'max:120'],
            // Password required on create; on update, blank means "keep the stored one".
            'password' => [$isCreate ? 'required' : 'nullable', 'string', 'max:120'],
            'serial_no' => ['nullable', 'string', 'max:100'],
            // Which company this terminal belongs to. Admins can assign any company
            // they may access (validated in the controller); others fall back to
            // their active company. Branch must belong to the chosen company.
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['nullable', 'integer',
                Rule::exists('branches', 'id')->where('company_id', $this->input('company_id') ?: $this->user()->active_company_id)],
            'is_active' => ['boolean'],
        ];
    }
}
