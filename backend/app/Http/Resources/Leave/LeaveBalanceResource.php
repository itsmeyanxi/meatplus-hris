<?php

namespace App\Http\Resources\Leave;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeaveBalanceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'employee_no' => $this->employee->employee_no,
                'full_name' => $this->employee->full_name,
            ]),
            'leave_type' => $this->whenLoaded('leaveType', fn () => [
                'id' => $this->leaveType->id,
                'code' => $this->leaveType->code,
                'name' => $this->leaveType->name,
            ]),
            'year' => $this->year,
            'opening_balance' => $this->opening_balance,
            'accrued' => $this->accrued,
            'granted_adhoc' => $this->granted_adhoc,
            'used' => $this->used,
            'current_balance' => $this->current_balance,
        ];
    }
}
