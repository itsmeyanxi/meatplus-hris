<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PerformanceGoalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'goal' => $this->goal,
            'due_date' => $this->due_date?->toDateString(),
            'feedback' => $this->feedback,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
