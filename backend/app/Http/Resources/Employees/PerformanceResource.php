<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PerformanceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'review_period_start' => $this->review_period_start?->toDateString(),
            'review_period_end' => $this->review_period_end?->toDateString(),
            'rating' => $this->rating,
            'rating_label' => $this->rating_label,
            'reviewer_employee_id' => $this->reviewer_employee_id,
            'reviewer_name' => $this->whenLoaded('reviewer', fn () => $this->reviewer?->full_name),
            'strengths' => $this->strengths,
            'areas_for_improvement' => $this->areas_for_improvement,
            'remarks' => $this->remarks,
            'next_review_date' => $this->next_review_date?->toDateString(),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
