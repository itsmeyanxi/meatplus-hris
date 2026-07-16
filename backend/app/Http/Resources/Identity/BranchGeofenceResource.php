<?php

namespace App\Http\Resources\Identity;

use App\Domain\Attendance\Services\GeofenceService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BranchGeofenceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'city' => $this->city,
            'province' => $this->province,
            'is_head_office' => (bool) $this->is_head_office,
            'is_active' => (bool) $this->is_active,
            'latitude' => $this->latitude !== null ? (float) $this->latitude : null,
            'longitude' => $this->longitude !== null ? (float) $this->longitude : null,
            'geofence_radius_m' => $this->geofence_radius_m,
            // The radius that would actually be enforced (explicit override or app default).
            'effective_radius_m' => $this->geofence_radius_m ?: GeofenceService::DEFAULT_RADIUS_M,
            'has_pin' => $this->latitude !== null && $this->longitude !== null,
        ];
    }
}
