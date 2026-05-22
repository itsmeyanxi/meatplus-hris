<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DependentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'full_name' => $this->full_name,
            'relationship' => $this->relationship,
            'birth_date' => $this->birth_date?->toDateString(),
            'is_minor' => $this->is_minor,
            'is_pwd' => $this->is_pwd,
            'is_qualified_for_tax_exemption' => $this->is_qualified_for_tax_exemption,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
