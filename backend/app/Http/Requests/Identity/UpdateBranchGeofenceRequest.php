<?php

namespace App\Http\Requests\Identity;

use Illuminate\Foundation\Http\FormRequest;

class UpdateBranchGeofenceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return (bool) $this->user()?->can('company.manage');
    }

    public function rules(): array
    {
        return [
            // Coordinates are set as a pair — sending one clears the geofence intent,
            // so both must be present together (or both null to remove the pin).
            'latitude' => ['nullable', 'numeric', 'between:-90,90', 'required_with:longitude'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180', 'required_with:latitude'],
            'geofence_radius_m' => ['nullable', 'integer', 'between:10,20000'],
        ];
    }
}
