<?php

namespace App\Http\Resources\Attendance;

use App\Domain\Attendance\Services\GeofenceService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TimeLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $lat = $this->lat !== null ? (float) $this->lat : null;
        $lng = $this->lng !== null ? (float) $this->lng : null;
        $employee = $this->relationLoaded('employee') ? $this->employee : null;
        $device = $this->relationLoaded('device') ? $this->device : null;

        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            // Who the punch belongs to — number and name, so the log is readable
            // without cross-referencing the employee list.
            'employee_no' => $employee?->employee_no,
            'employee_name' => $employee?->full_name,
            'logged_at' => $this->logged_at,
            'direction' => $this->direction,
            'source' => $this->source,
            'device_id' => $this->device_id,
            // Friendly, location-identifying device name (e.g. "PASEI - Mexico")
            // when the serial matches a registered terminal; null otherwise.
            'device_name' => $device?->name,
            'lat' => $lat,
            'lng' => $lng,
            // Geofence verdict vs the employee's assigned branch pin (null until the
            // branch has coordinates set). Only meaningful for located (web) punches.
            'geo' => app(GeofenceService::class)->evaluate($lat, $lng, $employee?->branch),
            'created_at' => $this->created_at,
        ];
    }
}
