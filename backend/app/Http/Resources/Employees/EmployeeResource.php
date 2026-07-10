<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_no' => $this->employee_no,
            'biometric_user_id' => $this->biometric_user_id,
            'full_name' => $this->full_name,

            'first_name' => $this->first_name,
            'middle_name' => $this->middle_name,
            'last_name' => $this->last_name,
            'suffix' => $this->suffix,

            'birth_date' => $this->birth_date?->toDateString(),
            'gender' => $this->gender,
            'civil_status' => $this->civil_status,
            'nationality' => $this->nationality,
            'religion' => $this->religion,

            'email_personal' => $this->email_personal,
            'email_company' => $this->email_company,
            'mobile' => $this->mobile,
            'phone_home' => $this->phone_home,

            'address' => [
                'line1' => $this->address_line1,
                'line2' => $this->address_line2,
                'city' => $this->city,
                'province' => $this->province,
                'postal_code' => $this->postal_code,
                'country' => $this->country,
            ],
            'permanent_address' => [
                'line1' => $this->permanent_address_line1,
                'line2' => $this->permanent_address_line2,
                'city' => $this->permanent_city,
                'province' => $this->permanent_province,
                'postal_code' => $this->permanent_postal_code,
                'country' => $this->permanent_country,
            ],

            'company' => $this->whenLoaded('company', fn () => [
                'id' => $this->company->id,
                'code' => $this->company->code,
                'name' => $this->company->trade_name ?? $this->company->legal_name,
            ]),
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
                'is_regular' => $this->employmentType->is_regular,
            ]),
            'manager' => $this->whenLoaded('manager', fn () => $this->manager ? [
                'id' => $this->manager->id,
                'full_name' => $this->manager->full_name,
            ] : null),

            'employee_type' => $this->employee_type,
            'user_type' => $this->user_type,
            'job_code' => $this->job_code,
            'job_grade' => $this->job_grade,
            'client_name' => $this->client_name,
            'billability' => $this->billability,
            'designated_workplace' => $this->designated_workplace,
            'payroll_run_type' => $this->payroll_run_type,
            'remarks' => $this->remarks,

            'date_hired' => $this->date_hired?->toDateString(),
            'expected_regularization_date' => $this->expected_regularization_date?->toDateString(),
            'date_regularized' => $this->date_regularized?->toDateString(),
            'date_separated' => $this->date_separated?->toDateString(),
            'separation_reason' => $this->separation_reason,

            'is_active' => $this->is_active,
            'photo_path' => $this->photo_path,

            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
