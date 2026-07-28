<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\Attendance\Models\AttendanceCorrection;
use App\Domain\Attendance\Models\CertificateOfAttendanceRequest;
use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\OfficialBusinessRequest;
use App\Domain\Attendance\Models\OvertimeRequest;
use App\Domain\Attendance\Models\UndertimeRequest;
use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Notifications\AttendanceRequestAwaitingApproval;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Payroll's timekeeping review for a cutoff. Payroll runs off attendance, so a
 * request still waiting for approval ("floating") can change an employee's pay
 * after the fact. This lists each employee's attendance totals for the period
 * alongside any floating approvals, and surfaces the head/manager to chase so
 * payroll can clear them before computing the run.
 */
class PayrollTimekeepingController extends Controller
{
    /** The five attendance request types that feed payroll, with their date column. */
    private const REQUESTS = [
        ['key' => 'overtime', 'label' => 'Overtime', 'model' => OvertimeRequest::class, 'date' => 'date'],
        ['key' => 'undertime', 'label' => 'Undertime', 'model' => UndertimeRequest::class, 'date' => 'date'],
        ['key' => 'official_business', 'label' => 'Official Business', 'model' => OfficialBusinessRequest::class, 'date' => 'date'],
        ['key' => 'coa', 'label' => 'Certificate of Attendance', 'model' => CertificateOfAttendanceRequest::class, 'date' => 'work_date'],
        ['key' => 'correction', 'label' => 'Correction', 'model' => AttendanceCorrection::class, 'date' => 'work_date'],
    ];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('payroll.view') || $request->user()->can('attendance.view.any'), 403);

        [$from, $to] = $this->period($request);

        // Attendance totals per employee for the cutoff (company-scoped via DTR).
        $dtr = DailyTimeRecord::query()
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])
            ->selectRaw('employee_id,
                count(*) filter (where not is_rest_day) as scheduled_days,
                count(*) filter (where actual_in is not null) as present_days,
                count(*) filter (where is_absent) as absent_days,
                count(*) filter (where is_on_leave) as leave_days,
                coalesce(sum(late_minutes),0) as late_minutes,
                coalesce(sum(overtime_minutes),0) as ot_minutes,
                coalesce(sum(undertime_minutes),0) as undertime_minutes,
                coalesce(sum(night_diff_minutes),0) as night_minutes')
            ->groupBy('employee_id')
            ->get()->keyBy('employee_id');

        // Floating (pending) requests in the period, grouped by employee then type.
        $floating = []; // employee_id => [key => count]
        foreach (self::REQUESTS as $r) {
            $rows = $r['model']::query()
                ->where('status', 'pending')
                ->whereBetween($r['date'], [$from->toDateString(), $to->toDateString()])
                ->selectRaw('employee_id, count(*) as c')
                ->groupBy('employee_id')->get();
            foreach ($rows as $row) {
                $floating[$row->employee_id][$r['key']] = (int) $row->c;
            }
        }

        // Only employees with attendance OR a floating request this cutoff.
        $employeeIds = collect(array_keys($dtr->toArray()))->merge(array_keys($floating))->unique()->values();

        $employees = Employee::query()
            ->whereIn('id', $employeeIds)
            ->with([
                'department:id,name,head_employee_id',
                'manager:id,first_name,last_name,email_company,email_personal,mobile',
                'department.head:id,first_name,last_name,email_company,email_personal,mobile',
            ])
            ->orderBy('last_name')->orderBy('first_name')
            ->get();

        $items = $employees->map(function (Employee $e) use ($dtr, $floating) {
            $d = $dtr->get($e->id);
            $fl = $floating[$e->id] ?? [];
            $floatingTotal = array_sum($fl);

            // Who to chase: the employee's direct manager, else their department head.
            $head = $e->manager ?? $e->department?->head;

            return [
                'employee_id' => $e->id,
                'employee_no' => $e->employee_no,
                'name' => $e->full_name,
                'department' => $e->department?->name,
                'attendance' => [
                    'scheduled_days' => (int) ($d->scheduled_days ?? 0),
                    'present_days' => (int) ($d->present_days ?? 0),
                    'absent_days' => (int) ($d->absent_days ?? 0),
                    'leave_days' => (int) ($d->leave_days ?? 0),
                    'late_minutes' => (int) ($d->late_minutes ?? 0),
                    'ot_minutes' => (int) ($d->ot_minutes ?? 0),
                    'undertime_minutes' => (int) ($d->undertime_minutes ?? 0),
                    'night_minutes' => (int) ($d->night_minutes ?? 0),
                ],
                'floating_total' => $floatingTotal,
                'floating' => $fl,
                'head' => $head ? [
                    'employee_id' => $head->id,
                    'name' => trim(($head->first_name ?? '').' '.($head->last_name ?? '')),
                    'email' => $head->email_company ?: $head->email_personal,
                    'mobile' => $head->mobile,
                ] : null,
            ];
        })->values();

        return response()->json([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'summary' => [
                'employees' => $items->count(),
                'with_floating' => $items->where('floating_total', '>', 0)->count(),
                'floating_total' => (int) $items->sum('floating_total'),
            ],
            'items' => $items,
        ]);
    }

    /**
     * Export the whole cutoff's timekeeping review as CSV — one row per employee
     * with attendance totals, floating-approval counts by type, and the head to
     * chase. Company-scoped like index(), so it's a per-company timekeeping report.
     */
    public function export(Request $request): StreamedResponse
    {
        abort_unless($request->user()->can('payroll.view') || $request->user()->can('attendance.view.any'), 403);
        [$from, $to] = $this->period($request);

        $dtr = DailyTimeRecord::query()
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])
            ->selectRaw('employee_id,
                count(*) filter (where not is_rest_day) as scheduled_days,
                count(*) filter (where actual_in is not null) as present_days,
                count(*) filter (where is_absent) as absent_days,
                count(*) filter (where is_on_leave) as leave_days,
                coalesce(sum(late_minutes),0) as late_minutes,
                coalesce(sum(overtime_minutes),0) as ot_minutes,
                coalesce(sum(undertime_minutes),0) as undertime_minutes,
                coalesce(sum(night_diff_minutes),0) as night_minutes')
            ->groupBy('employee_id')->get()->keyBy('employee_id');

        $floating = [];
        foreach (self::REQUESTS as $r) {
            foreach ($r['model']::query()->where('status', 'pending')->whereBetween($r['date'], [$from->toDateString(), $to->toDateString()])->selectRaw('employee_id, count(*) as c')->groupBy('employee_id')->get() as $row) {
                $floating[$row->employee_id][$r['key']] = (int) $row->c;
            }
        }

        $employeeIds = collect(array_keys($dtr->toArray()))->merge(array_keys($floating))->unique();
        $employees = Employee::query()->whereIn('id', $employeeIds)
            ->with(['department:id,name,head_employee_id', 'manager:id,first_name,last_name,email_company,email_personal,mobile', 'department.head:id,first_name,last_name,email_company,email_personal,mobile'])
            ->orderBy('last_name')->orderBy('first_name')->get();

        $filename = "timekeeping_{$from->toDateString()}_to_{$to->toDateString()}.csv";

        return response()->streamDownload(function () use ($employees, $dtr, $floating) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Employee No', 'Name', 'Department', 'Scheduled Days', 'Present', 'Absent', 'On Leave', 'Late (min)', 'OT (min)', 'Undertime (min)', 'Night (min)', 'Floating Total', 'Overtime', 'Undertime', 'Official Business', 'COA', 'Correction', 'Head to Contact', 'Head Contact']);
            foreach ($employees as $e) {
                $d = $dtr->get($e->id);
                $fl = $floating[$e->id] ?? [];
                $head = $e->manager ?? $e->department?->head;
                fputcsv($out, [
                    $e->employee_no,
                    $e->last_name.', '.$e->first_name,
                    $e->department?->name ?? '',
                    (int) ($d->scheduled_days ?? 0), (int) ($d->present_days ?? 0), (int) ($d->absent_days ?? 0), (int) ($d->leave_days ?? 0),
                    (int) ($d->late_minutes ?? 0), (int) ($d->ot_minutes ?? 0), (int) ($d->undertime_minutes ?? 0), (int) ($d->night_minutes ?? 0),
                    array_sum($fl),
                    $fl['overtime'] ?? 0, $fl['undertime'] ?? 0, $fl['official_business'] ?? 0, $fl['coa'] ?? 0, $fl['correction'] ?? 0,
                    $head ? trim(($head->first_name ?? '').' '.($head->last_name ?? '')) : '',
                    $head ? ($head->email_company ?: $head->email_personal ?: $head->mobile ?: '') : '',
                ]);
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    /**
     * Day-by-day review for one employee over the cutoff: every daily record with
     * its schedule, actual punches, computed totals and status, plus the specific
     * floating requests to clear. This is the drill-down behind a row.
     */
    public function detail(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('payroll.view') || $request->user()->can('attendance.view.any'), 403);
        [$from, $to] = $this->period($request);

        $employee->load([
            'department:id,name,head_employee_id',
            'position:id,title',
            'manager:id,first_name,last_name,email_company,email_personal,mobile',
            'department.head:id,first_name,last_name,email_company,email_personal,mobile',
        ]);

        $t = fn ($v) => $v ? CarbonImmutable::parse($v)->format('g:i A') : null;

        $days = DailyTimeRecord::query()
            ->where('employee_id', $employee->id)
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])
            ->orderBy('work_date')
            ->get()
            ->map(fn (DailyTimeRecord $d) => [
                'date' => $d->work_date?->toDateString(),
                'dow' => $d->work_date?->format('D'),
                'scheduled_in' => $t($d->scheduled_in),
                'scheduled_out' => $t($d->scheduled_out),
                'actual_in' => $t($d->actual_in),
                'actual_out' => $t($d->actual_out),
                'hours_worked' => (float) $d->hours_worked,
                'late_minutes' => (int) $d->late_minutes,
                'undertime_minutes' => (int) $d->undertime_minutes,
                'overtime_minutes' => (int) $d->overtime_minutes,
                'night_diff_minutes' => (int) $d->night_diff_minutes,
                'status' => $this->dayStatus($d),
            ]);

        // Floating (pending) requests with their dates, so the reviewer sees exactly what's open.
        $floating = [];
        foreach (self::REQUESTS as $r) {
            $rows = $r['model']::query()
                ->where('employee_id', $employee->id)
                ->where('status', 'pending')
                ->whereBetween($r['date'], [$from->toDateString(), $to->toDateString()])
                ->orderBy($r['date'])
                ->get();
            foreach ($rows as $req) {
                $floating[] = [
                    'type' => $r['key'],
                    'label' => $r['label'],
                    'date' => $req->{$r['date']} ? CarbonImmutable::parse($req->{$r['date']})->toDateString() : null,
                    'reason' => $req->reason ?? $req->remarks ?? null,
                    'id' => $req->id,
                ];
            }
        }

        $head = $employee->manager ?? $employee->department?->head;

        return response()->json([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'employee' => [
                'employee_id' => $employee->id,
                'employee_no' => $employee->employee_no,
                'name' => $employee->full_name,
                'department' => $employee->department?->name,
                'position' => $employee->position?->title,
            ],
            'totals' => [
                'scheduled_days' => $days->where('status', '!=', 'Rest day')->count(),
                'present_days' => $days->whereIn('status', ['Present', 'Holiday worked'])->count(),
                'absent_days' => $days->where('status', 'Absent')->count(),
                'leave_days' => $days->where('status', 'On leave')->count(),
                'late_minutes' => (int) $days->sum('late_minutes'),
                'ot_minutes' => (int) $days->sum('overtime_minutes'),
                'undertime_minutes' => (int) $days->sum('undertime_minutes'),
                'night_minutes' => (int) $days->sum('night_diff_minutes'),
            ],
            'days' => $days,
            'floating' => $floating,
            'head' => $head ? [
                'employee_id' => $head->id,
                'name' => trim(($head->first_name ?? '').' '.($head->last_name ?? '')),
                'email' => $head->email_company ?: $head->email_personal,
                'mobile' => $head->mobile,
            ] : null,
        ]);
    }

    /** A short display status for one daily record. */
    private function dayStatus(DailyTimeRecord $d): string
    {
        if ($d->is_rest_day) return 'Rest day';
        if ($d->is_on_leave) return 'On leave';
        if ($d->is_absent) return 'Absent';
        if ($d->holiday_type) return ($d->actual_in || (float) $d->hours_worked > 0) ? 'Holiday worked' : 'Holiday';
        if ($d->actual_in || (float) $d->hours_worked > 0) return 'Present';

        return 'No record';
    }

    /**
     * Nudge the head/approver about an employee's floating requests: re-sends the
     * in-app "awaiting approval" notification for each pending item in the cutoff.
     */
    public function remind(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('payroll.view') || $request->user()->can('attendance.view.any'), 403);

        $data = $request->validate([
            'employee_id' => ['required', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);
        [$from, $to] = $this->period($request);

        $employee = Employee::query()->find($data['employee_id']);
        abort_unless($employee, 404);

        $head = $employee->manager()->first() ?? $employee->department?->head;
        $headUserId = $head?->user_id;
        if (! $headUserId) {
            return response()->json(['message' => 'This employee has no head with an account to notify.', 'sent' => 0], 422);
        }
        $headUser = \App\Models\User::find($headUserId);
        if (! $headUser) {
            return response()->json(['message' => 'The head has no active login.', 'sent' => 0], 422);
        }

        $sent = 0;
        foreach (self::REQUESTS as $r) {
            $pending = $r['model']::query()
                ->where('employee_id', $employee->id)->where('status', 'pending')
                ->whereBetween($r['date'], [$from->toDateString(), $to->toDateString()])
                ->get();
            foreach ($pending as $req) {
                $date = $req->{$r['date']};
                $headUser->notify(new AttendanceRequestAwaitingApproval(
                    $r['label'].' (payroll reminder)',
                    $employee->full_name,
                    $date ? CarbonImmutable::parse($date)->toDateString() : null,
                    '/my-team',
                    $req->id,
                ));
                $sent++;
            }
        }

        return response()->json([
            'message' => $sent > 0
                ? "Reminder sent to {$head->first_name} {$head->last_name} for {$sent} floating request(s)."
                : 'No floating requests to remind about.',
            'sent' => $sent,
        ]);
    }

    /** Resolve the cutoff from query params, defaulting to the current semi-monthly period. */
    private function period(Request $request): array
    {
        $from = $request->query('from');
        $to = $request->query('to');
        if ($from && $to) {
            return [CarbonImmutable::parse($from), CarbonImmutable::parse($to)];
        }

        $now = CarbonImmutable::now();

        return $now->day <= 15
            ? [$now->startOfMonth(), $now->startOfMonth()->addDays(14)]
            : [$now->startOfMonth()->addDays(15), $now->endOfMonth()];
    }
}
