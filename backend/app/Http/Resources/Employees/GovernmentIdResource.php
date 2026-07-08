<?php

namespace App\Http\Resources\Employees;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GovernmentIdResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'tin' => $this->tin,
            'sss_no' => $this->sss_no,
            'philhealth_no' => $this->philhealth_no,
            'pagibig_no' => $this->pagibig_no,
            'prc_no' => $this->prc_no,
            'prc_expiry' => $this->prc_expiry?->toDateString(),
            'updated_at' => $this->updated_at,
        ];
    }
}
