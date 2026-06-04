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
            'day_status' => $this->dayStatus(),
            'remarks' => $this->remarks,
        ];
    }

    /** Single colour-friendly classification of the day. */
    private function dayStatus(): string
    {
        if ($this->is_on_leave) {
            return 'leave';
        }
        if ($this->is_absent) {
            return 'absent';
        }
        if ($this->holiday_type && (float) $this->hours_worked === 0.0) {
            return 'holiday';
        }
        if ($this->is_rest_day && (float) $this->hours_worked === 0.0) {
            return 'rest_day';
        }
        if ($this->late_minutes > 0) {
            return 'late';
        }
        if ((float) $this->hours_worked > 0 || $this->actual_in) {
            return 'present';
        }

        return 'no_record';
    }
}
