<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmploymentHistoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'company_name' => $this->company_name,
            'position' => $this->position,
            'from_date' => $this->from_date?->toDateString(),
            'to_date' => $this->to_date?->toDateString(),
            'reason_for_leaving' => $this->reason_for_leaving,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
