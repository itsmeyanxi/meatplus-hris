<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Activitylog\Models\Activity;

class AuditTrailController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('it_admin'), 403);

        $items = Activity::query()
            ->with('causer')
            ->latest('id')
            ->limit(300)
            ->get()
            ->map(fn (Activity $a) => [
                'id' => $a->id,
                'log_name' => $a->log_name,
                'event' => $a->event ?? $a->description,
                'subject_type' => $a->subject_type ? class_basename($a->subject_type) : null,
                'subject_id' => $a->subject_id,
                'causer' => $a->causer?->name ?? 'System',
                'changes' => $a->properties['attributes'] ?? [],
                'created_at' => $a->created_at,
            ]);

        return response()->json(['data' => $items]);
    }
}
