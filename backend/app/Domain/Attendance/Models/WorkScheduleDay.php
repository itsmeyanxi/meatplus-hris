<?php

namespace App\Domain\Attendance\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkScheduleDay extends Model
{
    protected $fillable = [
        'work_schedule_id', 'day_of_week', 'is_rest_day',
        'time_in', 'time_out', 'break_minutes', 'required_hours',
    ];

    protected function casts(): array
    {
        return [
            'day_of_week' => 'integer',
            'is_rest_day' => 'boolean',
            'break_minutes' => 'integer',
            'required_hours' => 'decimal:2',
        ];
    }

    public function workSchedule(): BelongsTo
    {
        return $this->belongsTo(WorkSchedule::class);
    }
}
