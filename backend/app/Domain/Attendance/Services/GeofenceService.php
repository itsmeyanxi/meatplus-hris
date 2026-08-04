<?php

namespace App\Domain\Attendance\Services;

use App\Domain\Identity\Models\Branch;

/**
 * Evaluates whether a punch's GPS location falls within a branch's worksite
 * geofence. Coordinates for branches are entered by admins (see the Branch
 * geofence settings page); until a branch has a pin set, evaluate() returns
 * null and punches are simply recorded without a geofence verdict — so the
 * feature activates per branch as its data is filled in.
 */
class GeofenceService
{
    /** Default allowed radius (metres) when a branch has no explicit override. */
    public const DEFAULT_RADIUS_M = 100;

    /**
     * @return array{distance_m:int,radius_m:int,outside:bool,branch_name:string}|null
     *   null when we can't judge (no punch coords, no branch, or branch has no pin).
     */
    public function evaluate(?float $lat, ?float $lng, ?Branch $branch): ?array
    {
        if ($lat === null || $lng === null || ! $branch) {
            return null;
        }
        if ($branch->latitude === null || $branch->longitude === null) {
            return null;
        }

        $distance = (int) round($this->haversineMetres(
            $lat,
            $lng,
            (float) $branch->latitude,
            (float) $branch->longitude,
        ));
        $radius = $branch->geofence_radius_m ?: self::DEFAULT_RADIUS_M;

        return [
            'distance_m' => $distance,
            'radius_m' => $radius,
            'outside' => $distance > $radius,
            'branch_name' => (string) $branch->name,
        ];
    }

    /** Great-circle distance between two lat/lng points, in metres. */
    private function haversineMetres(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earth = 6_371_000.0; // metres
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $earth * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
