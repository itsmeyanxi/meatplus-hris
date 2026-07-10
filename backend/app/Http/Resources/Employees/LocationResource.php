<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LocationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'branch_id' => $this->branch_id,
            'branch_name' => $this->whenLoaded('branch', fn () => $this->branch?->name),
            'code' => $this->whenLoaded('branch', fn () => $this->branch?->code),
            'latitude' => $this->whenLoaded('branch', fn () => $this->branch?->latitude),
            'longitude' => $this->whenLoaded('branch', fn () => $this->branch?->longitude),
            'designated_workplace' => $this->designated_workplace,
            'is_primary' => $this->is_primary,
        ];
    }
}
