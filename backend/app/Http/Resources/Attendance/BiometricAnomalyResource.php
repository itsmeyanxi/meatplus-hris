<?php

namespace App\Http\Resources\Attendance;

use App\Domain\HRIS\Models\Employee;
use Illuminate\Http\Resources\Json\JsonResource;

class BiometricAnomalyResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'employee' => [
                'id' => $this->employee?->id,
                'name' => Employee::formatName($this->employee?->first_name, $this->employee?->last_name),
                'employee_no' => $this->employee?->employee_no,
                'biometric_user_id' => $this->employee?->biometric_user_id,
            ],
            'pin' => $this->pin,
            'device_key' => $this->device_key,
            'device_name' => $this->device_name,
            'punches' => $this->punches,
            'detail' => $this->detail,
            'detected_at' => $this->detected_at,
            'resolved_at' => $this->resolved_at,
        ];
    }
}
