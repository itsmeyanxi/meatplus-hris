<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class VisaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'visa_type' => $this->visa_type,
            'visa_number' => $this->visa_number,
            'issue_date' => $this->issue_date?->toDateString(),
            'expiration_date' => $this->expiration_date?->toDateString(),
            'place_of_issue' => $this->place_of_issue,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
