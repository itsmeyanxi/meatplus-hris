<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\Holiday;
use App\Domain\Attendance\Models\OfficialBusinessRequest;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\ComputeDtrRequest;
use App\Http\Resources\Attendance\DailyTimeRecordResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DailyTimeRecordController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $records = $this->visibleQuery($request)
            ->orderBy('work_date', 'desc')
            // For the matrix view (no specific employee) allow up to one month × all
            // employees. Per-employee queries keep the tighter cap so the API stays snappy.
            ->limit($request->query('employee_id') ? 500 : 5000)
            ->get()
            ->sortBy('work_date')->values();

        return DailyTimeRecordResource::collection($records);
    }

    /**
     * The DTR rows this viewer is allowed to see, with the same filters the matrix
     * uses. Shared by index() and export() so a download can never show a different
     * population than the screen it was taken from.
     */
    private function visibleQuery(Request $request): \Illuminate\Database\Eloquent\Builder
    {
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        $q = DailyTimeRecord::query()->with('employee:id,employee_no,first_name,last_name,department_id');

        // HR (attendance.view.any) sees everyone; everyone else is locked to their own record.
        if ($user->can('attendance.view.any')) {
            if ($eid = $request->query('employee_id')) {
                $q->where('employee_id', $eid);
            }
            // Department filter for the matrix view.
            if ($did = $request->query('department_id')) {
                $q->whereHas('employee', fn ($eq) => $eq->where('department_id', $did));
            }
            // Keep agency workers out of the organic attendance module — they have
            // their own per-agency board in the Agencies module. Also exclude
            // inactive/separated staff: their historical DTR rows must not keep
            // showing (and being counted present/absent) on the live matrix. An
            // explicit employee_id still returns anyone, so a single agency worker or
            // a separated employee's history can still be opened directly.
            if (! $request->query('employee_id')) {
                $q->whereHas('employee', fn ($e) => $e
                    ->where('is_active', true)
                    ->whereDoesntHave('branch', fn ($b) => $b->where('is_agency', true)->orWhere('is_project_crew', true)));
            }
        } else {
            $employee = $user->employee;
            abort_unless($employee, 403, 'Your account is not linked to an employee record.');
            $q->where('employee_id', $employee->id);
        }

        if ($from = $request->query('from')) {
            $q->where('work_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->where('work_date', '<=', $to);
        }

        return $q;
    }

    /**
     * GET /api/v1/daily-time-records/export?from=&to=&employee_id=&department_id=
     *
     * The day-by-day DTR as a CSV, one row per employee per day. Deliberately the
     * plain daily grid (no rates or pay columns) — this is the timekeeping record
     * HR hands out, not the payroll register (see reports/dtr for that).
     *
     * Scoping is shared with the matrix via visibleQuery(), so an employee without
     * attendance.view.any can only ever export their OWN days.
     */
    public function export(Request $request): StreamedResponse
    {
        $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'employee_id' => ['nullable', 'integer'],
            'department_id' => ['nullable', 'integer'],
        ]);

        $records = $this->visibleQuery($request)
            ->with('employee.department:id,name')
            ->get()
            // Date first, then surname — the order the printed DTR is read in.
            ->sortBy([
                fn ($a, $b) => $a->work_date <=> $b->work_date,
                fn ($a, $b) => [$a->employee?->last_name, $a->employee?->first_name]
                    <=> [$b->employee?->last_name, $b->employee?->first_name],
            ])
            ->values();

        $from = $request->query('from');
        $to = $request->query('to');

        return response()->streamDownload(function () use ($records) {
            $out = fopen('php://output', 'w');

            // Hand-rolled instead of fputcsv(): PHP quotes any field containing a
            // SPACE, which would emit "Employee No" / "Time In" and change the
            // format HR already works with. Quote only when the value actually
            // needs it — a comma, a quote, or a line break (so a surname-first
            // name like "ABELADO, EDUARDO" is quoted, a department name is not).
            $line = function (array $cells) use ($out) {
                $cells = array_map(function ($v) {
                    $v = (string) $v;

                    return preg_match('/[",\r\n]/', $v)
                        ? '"'.str_replace('"', '""', $v).'"'
                        : $v;
                }, $cells);
                fwrite($out, implode(',', $cells)."\n");
            };

            $line([
                'Date', 'Employee No', 'Name', 'Department', 'Time In', 'Time Out',
                'Hours Worked', 'Late (min)', 'Undertime (min)', 'OT (min)',
                'Night Diff (min)', 'Status',
            ]);

            // Times as bare HH:MM (blank when the punch is missing), hours always to
            // 2 decimals, minute columns as plain integers.
            $hm = fn ($v) => $v ? \Carbon\CarbonImmutable::parse($v)->format('H:i') : '';

            foreach ($records as $r) {
                $e = $r->employee;
                $line([
                    $r->work_date?->toDateString(),
                    $e?->employee_no ?? '',
                    Employee::formatName($e?->first_name, $e?->last_name),
                    $e?->department?->name ?? '',
                    $hm($r->actual_in),
                    $hm($r->actual_out),
                    number_format((float) $r->hours_worked, 2, '.', ''),
                    (int) $r->late_minutes,
                    (int) $r->undertime_minutes,
                    (int) $r->overtime_minutes,
                    (int) $r->night_diff_minutes,
                    $r->dayStatus(),
                ]);
            }

            fclose($out);
        }, "dtr_{$from}_to_{$to}.csv", [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /**
     * Self-service: the authenticated user's own daily time records for a date range.
     * No attendance.view needed — scoped strictly to their linked employee record.
     */
    public function mine(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;
        abort_unless($employee, 403, 'Your account is not linked to an employee record.');

        $from = $request->query('from');
        $to = $request->query('to');

        // Order DESC so the row cap always keeps the most recent days (the calendar
        // cares about current/upcoming dates); a wide range never drops them.
        $q = DailyTimeRecord::query()
            ->where('employee_id', $employee->id)
            ->orderBy('work_date', 'desc');

        if ($from) {
            $q->where('work_date', '>=', $from);
        }
        if ($to) {
            $q->where('work_date', '<=', $to);
        }

        $records = $q->limit(800)->get();

        // Attach the holiday name (e.g. "Labor Day") to holiday rows so the
        // calendar can show which holiday it is, not just a generic label.
        $holidays = Holiday::query()
            ->where(function ($hq) use ($employee) {
                $hq->whereNull('company_id')->orWhere('company_id', $employee->company_id);
            })
            ->where(function ($hq) use ($employee) {
                $hq->whereNull('applicable_branch_id')->orWhere('applicable_branch_id', $employee->branch_id);
            })
            ->when($from, fn ($hq) => $hq->where('holiday_date', '>=', $from))
            ->when($to, fn ($hq) => $hq->where('holiday_date', '<=', $to))
            ->get()
            ->keyBy(fn (Holiday $h) => $h->holiday_date->toDateString());

        // Approved Official Business overlapping the range. OB certifies presence, so
        // in the DTR an OB day looks like a plain "present" row — it carries no OB flag
        // of its own. We resolve the covered dates here so the UI can label them and
        // the summary can count them distinctly (they still count as present too).
        $obDates = [];
        $obRequests = OfficialBusinessRequest::query()
            ->where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->get();
        foreach ($obRequests as $ob) {
            $start = $ob->date;
            $end = $ob->date_to ?? $ob->date;
            if (! $start) {
                continue;
            }
            for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
                $ds = $d->toDateString();
                if ((! $from || $ds >= $from) && (! $to || $ds <= $to)) {
                    $obDates[$ds] = true;
                }
            }
        }

        $summary = [
            'present' => 0, 'late' => 0, 'absent' => 0, 'leave' => 0, 'holiday' => 0, 'rest_day' => 0,
            'ob' => 0, 'overtime_minutes' => 0, 'undertime_minutes' => 0,
        ];
        foreach ($records as $r) {
            if ($r->holiday_type) {
                $r->holiday_name = $holidays->get($r->work_date->toDateString())?->name;
            }
            $status = $r->dayStatus();
            if (array_key_exists($status, $summary)) {
                $summary[$status]++;
            }
            $summary['overtime_minutes'] += (int) $r->overtime_minutes;
            $summary['undertime_minutes'] += (int) $r->undertime_minutes;
        }
        $summary['ob'] = count($obDates);

        return response()->json([
            'data' => DailyTimeRecordResource::collection($records),
            'summary' => $summary,
            'ob_dates' => array_keys($obDates),
        ]);
    }

    public function compute(ComputeDtrRequest $request, DtrComputer $computer): AnonymousResourceCollection
    {
        $employee = Employee::findOrFail($request->validated('employee_id'));

        $records = $computer->computeForEmployee(
            $employee,
            \Carbon\CarbonImmutable::parse($request->validated('from')),
            \Carbon\CarbonImmutable::parse($request->validated('to')),
        );

        return DailyTimeRecordResource::collection($records);
    }
}
