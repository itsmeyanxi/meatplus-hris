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
            'email_company' => $this->email_company,
            'date_hired' => $this->date_hired?->toDateString(),
            'is_active' => $this->is_active,
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
