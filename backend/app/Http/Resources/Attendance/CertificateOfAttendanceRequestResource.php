<?php

namespace App\Http\Resources\Attendance;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CertificateOfAttendanceRequestResource extends JsonResource
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
            'work_date' => $this->work_date?->toDateString(),
            'missed_punch' => $this->missed_punch,
            'claimed_time_in' => $this->claimed_time_in,
            'claimed_time_out' => $this->claimed_time_out,
            'reason' => $this->reason,
            'status' => $this->status,
            'approved_by' => $this->whenLoaded('approver', fn () => $this->approver ? [
                'id' => $this->approver->id,
                'name' => $this->approver->name,
            ] : null),
            'decided_at' => $this->decided_at,
            'decision_remarks' => $this->decision_remarks,
            'created_at' => $this->created_at,
        ];
    }
}
