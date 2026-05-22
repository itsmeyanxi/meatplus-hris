<?php

namespace App\Http\Resources\Attendance;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TimeLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'logged_at' => $this->logged_at,
            'direction' => $this->direction,
            'source' => $this->source,
            'device_id' => $this->device_id,
            'created_at' => $this->created_at,
        ];
    }
}
