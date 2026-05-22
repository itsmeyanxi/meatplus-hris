<?php

namespace App\Http\Resources\Leave;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeaveTypeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'default_credits_per_year' => $this->default_credits_per_year,
            'is_paid' => $this->is_paid,
            'is_convertible_to_cash' => $this->is_convertible_to_cash,
            'requires_attachment' => $this->requires_attachment,
            'min_days_filing_lead' => $this->min_days_filing_lead,
            'max_consecutive_days' => $this->max_consecutive_days,
            'gender_restriction' => $this->gender_restriction,
            'accrual_method' => $this->accrual_method,
            'is_active' => $this->is_active,
        ];
    }
}
