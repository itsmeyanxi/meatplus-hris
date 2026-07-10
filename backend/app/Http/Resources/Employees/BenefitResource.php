<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BenefitResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'type' => $this->type,
            'is_active' => $this->is_active,
            'effective_date' => $this->effective_date?->toDateString(),
            'enrollment_date' => $this->enrollment_date?->toDateString(),
            'plan' => $this->plan,
            'beneficiary' => $this->beneficiary,
            'payment_type' => $this->payment_type,
            'notes' => $this->notes,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
