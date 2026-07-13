<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AssetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'item' => $this->item,
            'category' => $this->category,
            'condition' => $this->condition,
            'purchase_price' => $this->purchase_price,
            'serial_number' => $this->serial_number,
            'acquired_date' => $this->acquired_date?->toDateString(),
            'date_issued' => $this->date_issued?->toDateString(),
            'date_returned' => $this->date_returned?->toDateString(),
            'notes' => $this->notes,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
