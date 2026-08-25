<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\BiometricAnomaly;
use App\Domain\Attendance\Services\Biometric\BiometricAnomalyDetector;
use App\Http\Controllers\Controller;
use App\Http\Resources\Attendance\BiometricAnomalyResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * HR review + resolution of detected biometric PIN-reuse collisions
 * (see {@see BiometricAnomalyDetector}). Gated by attendance.manage — the same
 * authority that receives the daily {@see \App\Notifications\BiometricHealthDigest}.
 */
class BiometricAnomalyController extends Controller
{
    private const RELATION = 'employee:id,first_name,last_name,employee_no,biometric_user_id,company_id';

    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('attendance.manage'), 403);

        $query = BiometricAnomaly::with(self::RELATION)
            ->orderByRaw('resolved_at is null desc') // open issues first
            ->orderByDesc('detected_at');

        if (! $request->boolean('include_resolved')) {
            $query->whereNull('resolved_at');
        }

        return BiometricAnomalyResource::collection($query->get());
    }

    /** Re-run detection now (the "Check now" button) and report the outcome. */
    public function rescan(Request $request, BiometricAnomalyDetector $detector): JsonResponse
    {
        abort_unless($request->user()->can('attendance.manage'), 403);

        return response()->json($detector->sync());
    }

    /** HR has handled this one (fixed the mapping, or judged it fine) — close it. */
    public function resolve(Request $request, BiometricAnomaly $biometricAnomaly): BiometricAnomalyResource
    {
        abort_unless($request->user()->can('attendance.manage'), 403);

        $biometricAnomaly->forceFill(['resolved_at' => now()])->save();

        return new BiometricAnomalyResource($biometricAnomaly->load(self::RELATION));
    }
}
