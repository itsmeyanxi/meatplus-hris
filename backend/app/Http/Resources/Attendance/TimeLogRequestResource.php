<?php

namespace App\Http\Resources\Attendance;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TimeLogRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'batch_id' => $this->batch_id,
            'employee_id' => $this->employee_id,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'employee_no' => $this->employee->employee_no,
                'full_name' => $this->employee->full_name,
            ]),
            'work_date' => optional($this->work_date)->toDateString(),
            'time_in' => $this->time_in ? substr((string) $this->time_in, 0, 5) : null,
            'time_out' => $this->time_out ? substr((string) $this->time_out, 0, 5) : null,
            'status' => $this->status,
            'note' => $this->note,
            'uploaded_by_name' => $this->whenLoaded('uploader', fn () => $this->uploader?->name),
            'decided_at' => optional($this->decided_at)->toIso8601String(),
            'decision_remarks' => $this->decision_remarks,
            'created_at' => optional($this->created_at)->toIso8601String(),
        ];
    }
}
