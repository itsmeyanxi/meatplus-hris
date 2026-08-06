<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_no' => $this->employee_no,
            'full_name' => $this->full_name,
            'last_name' => $this->last_name,
            'first_name' => $this->first_name,
            'middle_name' => $this->middle_name,
            'gender' => $this->gender,
            'civil_status' => $this->civil_status,
            'email_company' => $this->email_company,
            'email_personal' => $this->email_personal,
            'date_hired' => $this->date_hired?->toDateString(),
            'is_active' => $this->is_active,
            // Confidential classification is sensitive — only surfaced to users who
            // may see/change it, so the list can show a badge for them.
            'is_confidential' => $request->user()?->can('employee.view.sensitive') ? (bool) $this->is_confidential : null,
            'login_status' => $this->user_id
                ? 'active'
                : ($this->has_pending_invitation ? 'invited' : 'none'),
            'branch' => $this->whenLoaded('branch', fn () => [
                'id' => $this->branch->id,
                'name' => $this->branch->name,
            ]),
            'department' => $this->whenLoaded('department', fn () => [
                'id' => $this->department->id,
                'name' => $this->department->name,
            ]),
            'position' => $this->whenLoaded('position', fn () => [
                'id' => $this->position->id,
                'title' => $this->position->title,
            ]),
            'employment_type' => $this->whenLoaded('employmentType', fn () => [
                'id' => $this->employmentType->id,
                'name' => $this->employmentType->name,
            ]),
            'company' => $this->whenLoaded('company', fn () => [
                'id' => $this->company->id,
                'code' => $this->company->code,
                'name' => $this->company->trade_name ?: $this->company->legal_name,
            ]),
        ];
    }
}
