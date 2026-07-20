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

        // Site location — where the punch physically happened. Biometric punches
        // carry no GPS, so we fall back to the fixed location of the terminal's
        // branch (or, failing that, the employee's branch, then the company).
        $branch = ($device && $device->relationLoaded('branch') && $device->branch)
            ? $device->branch
            : $employee?->branch;
        $company = $employee?->relationLoaded('company') ? $employee->company : null;

        $siteLocation = null;
        $siteLat = null;
        $siteLng = null;
        if ($branch) {
            $siteLocation = trim(implode(', ', array_filter([
                $branch->name,
                $branch->city && stripos((string) $branch->name, (string) $branch->city) === false ? $branch->city : null,
                $branch->province && stripos((string) $branch->name, (string) $branch->province) === false ? $branch->province : null,
            ]))) ?: $branch->name;
            $siteLat = $branch->latitude !== null ? (float) $branch->latitude : null;
            $siteLng = $branch->longitude !== null ? (float) $branch->longitude : null;
        } elseif ($company) {
            $siteLocation = trim(implode(', ', array_filter([$company->city, $company->province])))
                ?: ($company->trade_name ?: $company->legal_name);
        }

        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            // Who the punch belongs to — number and name, so the log is readable
            // without cross-referencing the employee list.
            'employee_no' => $employee?->employee_no,
            'employee_name' => $employee?->full_name,
            // Which company the employee belongs to (useful when an it_admin
            // views punches across all companies).
            'company_code' => $company?->code,
            'company_name' => $company?->trade_name ?: $company?->legal_name,
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
            // Fixed site/company location for punches without their own GPS.
            'site_location' => $siteLocation,
            'site_lat' => $siteLat,
            'site_lng' => $siteLng,
            'created_at' => $this->created_at,
        ];
    }
}
