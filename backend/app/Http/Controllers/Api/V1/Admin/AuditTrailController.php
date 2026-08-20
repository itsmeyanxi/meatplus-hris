<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AuditTrailController extends Controller
{
    /** Page size ceiling, so one request can't pull the whole log. */
    private const PER_PAGE_MAX = 200;

    /**
     * Foreign-key columns worth resolving to a readable name. Without this, a change
     * reads "department_id: 4 → 7", which tells an auditor nothing.
     *
     * column => [table, label column]
     */
    private const FK_LABELS = [
        'department_id' => ['departments', 'name'],
        'position_id' => ['positions', 'title'],
        'employment_type_id' => ['employment_types', 'name'],
        'branch_id' => ['branches', 'name'],
        'applicable_branch_id' => ['branches', 'name'],
        'company_id' => ['companies', 'code'],
        'active_company_id' => ['companies', 'code'],
        'original_company_id' => ['companies', 'code'],
        'leave_type_id' => ['leave_types', 'name'],
        'work_schedule_id' => ['work_schedules', 'name'],
        'payroll_run_id' => ['payroll_runs', 'name'],
    ];

    /** Employee-valued columns — resolved to a person's name, surname first. */
    private const EMPLOYEE_FK = ['manager_employee_id', 'head_employee_id', 'employee_id'];

    /** Raw column names an auditor should not have to decode. */
    private const FIELD_LABELS = [
        'is_active' => 'Active',
        'is_confidential' => 'Confidential',
        'time_in_out_required' => 'Must time in/out',
        'schedule_type' => 'Schedule type',
        'date_separated' => 'Separation date',
        'date_hired' => 'Date hired',
        'employee_no' => 'Employee no.',
        'biometric_user_id' => 'Biometric ID',
        'basic_monthly' => 'Monthly salary',
        'daily_rate' => 'Daily rate',
        'hourly_rate' => 'Hourly rate',
        'allowance_monthly' => 'Monthly allowance',
        'active_company_id' => 'Active company',
        'must_change_password' => 'Must change password',
    ];

    public function index(Request $request): JsonResponse
    {
        $this->authorizeView($request);

        $perPage = min(max(1, (int) $request->integer('per_page', 50)), self::PER_PAGE_MAX);
        $page = max(1, (int) $request->integer('page', 1));

        $query = $this->filtered($request);
        $total = (clone $query)->toBase()->getCountForPagination();

        $rows = $query->with(['causer', 'subject'])
            ->latest('id')
            ->forPage($page, $perPage)
            ->get();

        return response()->json([
            'data' => $this->present($rows),
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => (int) max(1, ceil($total / $perPage)),
                'log_names' => Activity::query()->distinct()->orderBy('log_name')->pluck('log_name')->filter()->values(),
                'events' => Activity::query()->distinct()->orderBy('event')->pluck('event')->filter()->values(),
                // Lets the UI say how much of the log is unattributed import/seed noise.
                'system_rows' => Activity::query()->whereNull('causer_id')->count(),
                'total_rows' => Activity::query()->count(),
            ],
        ]);
    }

    /**
     * The same filtered view as a CSV, so an audit finding can leave the screen —
     * for a compliance pack, an investigation, or a signature. One row per changed
     * FIELD, so the file can be sorted and pivoted.
     */
    public function export(Request $request): StreamedResponse
    {
        $this->authorizeView($request);

        $rows = $this->filtered($request)->with(['causer', 'subject'])->latest('id')->limit(20000)->get();
        $items = $this->present($rows);
        $stamp = now()->format('Y-m-d');

        return response()->streamDownload(function () use ($items) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['When', 'Who', 'Action', 'Area', 'Record', 'Record ID', 'Field', 'Old value', 'New value']);

            foreach ($items as $a) {
                $when = $a['created_at'] ? $a['created_at']->format('Y-m-d H:i:s') : '';
                $base = [$when, $a['causer'], $a['event'], $a['log_name'], $a['subject_label'], $a['subject_id']];

                if (! $a['changes']) {
                    fputcsv($out, array_merge($base, ['', '', '']));

                    continue;
                }
                foreach ($a['changes'] as $c) {
                    fputcsv($out, array_merge($base, [$c['label'], $c['old'], $c['new']]));
                }
            }
            fclose($out);
        }, 'audit_trail_'.$stamp.'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Viewing the audit trail: super_admin or IT admin.
     *
     * Was hasRole('it_admin') — a raw, team-scoped role check that does NOT pass
     * through Gate::before, so the super_admin (top of the hierarchy) got a 403 on
     * the one screen that shows who changed what.
     */
    private function authorizeView(Request $request): void
    {
        $user = $request->user();

        abort_unless(
            $user && ($user->isSuperAdmin() || $user->isItAdmin()),
            403,
            'The audit trail is limited to IT and super administrators.'
        );
    }

    /** @return Builder<Activity> */
    private function filtered(Request $request): Builder
    {
        $query = Activity::query();

        if ($log = $request->query('log_name')) {
            $query->where('log_name', $log);
        }
        if ($event = $request->query('event')) {
            $query->where('event', $event);
        }
        if ($from = $request->query('from')) {
            $query->where('created_at', '>=', $from.' 00:00:00');
        }
        if ($to = $request->query('to')) {
            $query->where('created_at', '<=', $to.' 23:59:59');
        }

        // Most of the log is unattributed import/seed activity. "people" hides it so a
        // real human action is findable; "system" isolates it for import forensics.
        $actor = $request->query('actor');
        if ($actor === 'people') {
            $query->whereNotNull('causer_id');
        } elseif ($actor === 'system') {
            $query->whereNull('causer_id');
        }

        // Everything that ever happened to ONE record — the question an auditor
        // actually asks ("what was done to this employee?").
        if ($subjectId = $request->query('subject_id')) {
            $query->where('subject_id', $subjectId);
            if ($subjectType = $request->query('subject_type')) {
                $query->where('subject_type', 'like', '%'.$subjectType);
            }
        }

        if ($search = $request->query('q')) {
            $like = '%'.str_replace('%', '\%', $search).'%';
            $query->where(function ($w) use ($like) {
                $w->where('description', 'ilike', $like)
                    ->orWhereHas('causer', fn ($c) => $c->where('name', 'ilike', $like))
                    // Search recorded values too, so an employee no. or a salary finds its change.
                    ->orWhere('properties', 'ilike', $like);
            });
        }

        return $query;
    }

    /**
     * Shape activities for output, resolving FK ids to names in ONE pass so a
     * 200-row page doesn't fire hundreds of lookups.
     */
    private function present(Collection $rows): array
    {
        $lookups = $this->resolveLookups($rows);

        return $rows->map(fn (Activity $a) => [
            'id' => $a->id,
            'log_name' => $a->log_name,
            'event' => $a->event ?? $a->description,
            'subject_type' => $a->subject_type ? class_basename($a->subject_type) : null,
            'subject_id' => $a->subject_id,
            'subject_label' => $this->subjectLabel($a),
            'causer' => $a->causer?->name ?? 'System',
            'is_system' => $a->causer_id === null,
            'changes' => $this->diff($a, $lookups),
            'created_at' => $a->created_at,
        ])->all();
    }

    /**
     * Pre-fetch every id referenced by an FK column across the whole page.
     *
     * @return array<string, array<int|string, string>> table => [id => label]
     */
    private function resolveLookups(Collection $rows): array
    {
        $wanted = [];

        foreach ($rows as $a) {
            $props = array_merge(
                (array) ($a->properties['old'] ?? []),
                (array) ($a->properties['attributes'] ?? []),
            );

            foreach ($props as $col => $val) {
                if ($val === null || $val === '' || is_array($val)) {
                    continue;
                }
                if (isset(self::FK_LABELS[$col])) {
                    $wanted[self::FK_LABELS[$col][0]][] = $val;
                } elseif (in_array($col, self::EMPLOYEE_FK, true)) {
                    $wanted['employees'][] = $val;
                }
            }
        }

        $out = [];

        foreach ($wanted as $table => $ids) {
            $ids = array_values(array_unique($ids));

            if ($table === 'employees') {
                $out['employees'] = DB::table('employees')->whereIn('id', $ids)
                    ->get(['id', 'first_name', 'last_name'])
                    ->mapWithKeys(fn ($e) => [$e->id => Employee::formatName($e->first_name, $e->last_name)])
                    ->all();

                continue;
            }

            $labelCol = 'name';
            foreach (self::FK_LABELS as $spec) {
                if ($spec[0] === $table) {
                    $labelCol = $spec[1];
                    break;
                }
            }

            $out[$table] = DB::table($table)->whereIn('id', $ids)->pluck($labelCol, 'id')->all();
        }

        return $out;
    }

    /** Build a per-field old→new diff, with readable labels and resolved ids. */
    private function diff(Activity $a, array $lookups): array
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
                'label' => self::FIELD_LABELS[$key] ?? ucfirst(str_replace('_', ' ', preg_replace('/_id$/', '', $key))),
                'old' => $this->display($key, $ov, $lookups),
                'new' => $this->display($key, $nv, $lookups),
            ];
        }

        return $changes;
    }

    /** Render one value: booleans as words, FK ids as the thing they point at. */
    private function display(string $key, mixed $v, array $lookups): mixed
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (is_bool($v)) {
            return $v ? 'Yes' : 'No';
        }
        if (is_array($v)) {
            return json_encode($v);
        }

        if (isset(self::FK_LABELS[$key])) {
            $label = $lookups[self::FK_LABELS[$key][0]][$v] ?? null;

            return $label ? $label.' (#'.$v.')' : $v;
        }

        if (in_array($key, self::EMPLOYEE_FK, true)) {
            $label = $lookups['employees'][$v] ?? null;

            return $label ? $label.' (#'.$v.')' : $v;
        }

        return $v;
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
