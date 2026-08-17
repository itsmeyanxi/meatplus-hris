<?php

namespace App\Http\Resources\Attendance;

use App\Domain\HRIS\Models\Employee;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DailyTimeRecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'employee_no' => $this->employee->employee_no,
                // Surname-first, and without the middle name/suffix — the DTR
                // matrix column is narrow and truncates.
                'full_name' => Employee::formatName($this->employee->first_name, $this->employee->last_name),
            ]),
            'work_date' => $this->work_date?->toDateString(),
            'scheduled_in' => $this->scheduled_in,
            'scheduled_out' => $this->scheduled_out,
            'actual_in' => $this->actual_in,
            'actual_out' => $this->actual_out,
            'hours_worked' => $this->hours_worked,
            'late_minutes' => $this->late_minutes,
            'undertime_minutes' => $this->undertime_minutes,
            'overtime_minutes' => $this->overtime_minutes,
            'night_diff_minutes' => $this->night_diff_minutes,
            'holiday_type' => $this->holiday_type,
            'holiday_name' => $this->holiday_name ?? null,
            'is_rest_day' => $this->is_rest_day,
            'is_absent' => $this->is_absent,
            'is_on_leave' => $this->is_on_leave,
            'is_adjusted' => $this->is_adjusted,
            'status' => $this->status,
            'day_status' => $this->dayStatus(),
            'remarks' => $this->remarks,
        ];
    }
}
