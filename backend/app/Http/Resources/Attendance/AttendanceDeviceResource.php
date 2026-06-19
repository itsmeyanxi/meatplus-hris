<?php

namespace App\Http\Resources\Attendance;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceDeviceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'vendor' => $this->vendor,
            'serial_no' => $this->serial_no,
            'ip_address' => $this->ip_address,
            'port' => $this->port,
            'timezone' => $this->timezone,
            'username' => $this->username,
            // password is never exposed
            'is_active' => $this->is_active,
            'branch_id' => $this->branch_id,
            'last_synced_at' => $this->last_synced_at?->toIso8601String(),
            'last_event_at' => $this->last_event_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
