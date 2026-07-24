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
