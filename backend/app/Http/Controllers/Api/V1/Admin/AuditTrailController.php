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

        $query = Activity::query()
            ->with(['causer', 'subject'])
            ->latest('id');

        // Filters.
        if ($log = $request->query('log_name')) {
            $query->where('log_name', $log);
        }
        if ($event = $request->query('event')) {
            $query->where('event', $event);
        }
        if ($from = $request->query('from')) {
            $query->where('created_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $query->where('created_at', '<=', $to.' 23:59:59');
        }
        if ($search = $request->query('q')) {
            $like = '%'.str_replace('%', '\%', $search).'%';
            $query->where(function ($w) use ($like) {
                $w->where('description', 'ilike', $like)
                    ->orWhereHas('causer', fn ($c) => $c->where('name', 'ilike', $like));
            });
        }

        $items = $query->limit(500)->get()->map(fn (Activity $a) => [
            'id' => $a->id,
            'log_name' => $a->log_name,
            'event' => $a->event ?? $a->description,
            'subject_type' => $a->subject_type ? class_basename($a->subject_type) : null,
            'subject_id' => $a->subject_id,
            'subject_label' => $this->subjectLabel($a),
            'causer' => $a->causer?->name ?? 'System',
            // Field-level diff: old → new for each changed attribute.
            'changes' => $this->diff($a),
            'created_at' => $a->created_at,
        ]);

        // Distinct areas/events present, so the UI can build filter dropdowns.
        return response()->json([
            'data' => $items,
            'meta' => [
                'log_names' => Activity::query()->distinct()->orderBy('log_name')->pluck('log_name')->filter()->values(),
                'events' => Activity::query()->distinct()->orderBy('event')->pluck('event')->filter()->values(),
            ],
        ]);
    }

    /** Build a per-field old→new diff from the activity's stored properties. */
    private function diff(Activity $a): array
    {
        $old = (array) ($a->properties['old'] ?? []);
        $new = (array) ($a->properties['attributes'] ?? []);
        $keys = array_values(array_unique(array_merge(array_keys($old), array_keys($new))));

        $changes = [];
        foreach ($keys as $key) {
            $ov = $old[$key] ?? null;
            $nv = $new[$key] ?? null;
            // On updates, skip unchanged fields; on create/delete show everything.
            if ($a->event === 'updated' && $ov === $nv) {
                continue;
            }
            $changes[] = [
                'field' => $key,
                'old' => $this->scalar($ov),
                'new' => $this->scalar($nv),
            ];
        }

        return $changes;
    }

    private function scalar(mixed $v): mixed
    {
        if (is_bool($v)) {
            return $v ? 'true' : 'false';
        }

        return is_array($v) ? json_encode($v) : $v;
    }

    /** A human label for the affected record (employee name, user name, run name, …). */
    private function subjectLabel(Activity $a): ?string
    {
        $s = $a->subject;
        if (! $s) {
            return null;
        }

        foreach (['full_name', 'name', 'title', 'employee_no', 'code'] as $attr) {
            if (! empty($s->{$attr})) {
                return (string) $s->{$attr};
            }
        }

        return null;
    }
}
