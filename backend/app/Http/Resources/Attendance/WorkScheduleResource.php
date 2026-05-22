<?php

namespace App\Http\Resources\Attendance;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WorkScheduleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'description' => $this->description,
            'is_flexible' => $this->is_flexible,
            'breaks_paid' => $this->breaks_paid,
            'weekly_workdays' => $this->weekly_workdays,
            'is_active' => $this->is_active,
            'days' => $this->whenLoaded('days', fn () => $this->days->map(fn ($d) => [
                'day_of_week' => $d->day_of_week,
                'is_rest_day' => $d->is_rest_day,
                'time_in' => $d->time_in,
                'time_out' => $d->time_out,
                'break_minutes' => $d->break_minutes,
                'required_hours' => $d->required_hours,
            ])),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
