<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EducationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'level' => $this->level,
            'school' => $this->school,
            'degree' => $this->degree,
            'year_from' => $this->year_from,
            'year_to' => $this->year_to,
            'honors' => $this->honors,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
