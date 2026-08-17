<?php

namespace App\Http\Resources\Employees;

use App\Domain\HRIS\Models\Employee;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeDataIssueResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'employee' => [
                'id' => $this->employee?->id,
                'name' => Employee::formatName($this->employee?->first_name, $this->employee?->last_name),
                'employee_no' => $this->employee?->employee_no,
            ],
            'category' => $this->category,
            'severity' => $this->severity,
            'detail' => $this->detail,
            'detected_at' => $this->detected_at,
            'resolved_at' => $this->resolved_at,
            'ignored' => (bool) $this->ignored,
        ];
    }
}
