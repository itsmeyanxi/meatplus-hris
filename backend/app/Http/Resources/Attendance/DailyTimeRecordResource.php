<?php

namespace App\Http\Resources\Attendance;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DailyTimeRecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
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
            'is_rest_day' => $this->is_rest_day,
            'is_absent' => $this->is_absent,
            'is_on_leave' => $this->is_on_leave,
            'status' => $this->status,
            'remarks' => $this->remarks,
        ];
    }
}
