<?php

namespace App\Http\Controllers\Api\V1\Reports;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\OvertimeRequest;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeGovernmentId;
use App\Domain\Identity\Models\Branch;
use App\Domain\Identity\Models\Company;
use App\Domain\Leave\Models\LeaveApplication;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\Payslip;
use App\Domain\Payroll\Services\StatutoryCalculator;
use App\Http\Controllers\Controller;
use App\Support\XlsxReport;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Options as XlsxOptions;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ReportController extends Controller
{
    /** GET /api/v1/reports/dtr?date_from=&date_to=&employee_id=&department_id= */
    public function dtr(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        $request->validate([
            'date_from'     => ['required', 'date'],
            'date_to'       => ['required', 'date', 'after_or_equal:date_from'],
            'employee_id'   => ['nullable', 'integer'],
            'department_id' => ['nullable', 'integer'],
        ]);

        $rows = DailyTimeRecord::query()
            ->with('employee:id,employee_no,first_name,last_name,department_id')
            ->with('employee.department:id,name')
            ->whereBetween('work_date', [$request->date_from, $request->date_to])
            ->when($request->employee_id, fn ($q) => $q->where('employee_id', $request->employee_id))
            ->when($request->department_id, fn ($q) => $q->whereHas(
                'employee', fn ($e) => $e->where('department_id', $request->department_id)
            ))
            // Keep agency workers out of the company's internal DTR — they have their
            // own per-agency report. An explicit employee_id still returns anyone.
            ->when(! $request->employee_id, fn ($q) => $q->whereHas(
                'employee', fn ($e) => $e->whereDoesntHave('branch', fn ($b) => $b->where('is_agency', true))
            ))
            ->orderBy('work_date')
            ->orderBy('employee_id')
            ->get();

        $headers = [
            'Date', 'Employee No', 'Name', 'Department',
            'Time In', 'Time Out', 'Hours Worked',
            'Late (min)', 'Undertime (min)', 'OT (min)', 'Night Diff (min)',
            'Status',
        ];
        $data = [];
        foreach ($rows as $r) {
            $data[] = [
                $r->work_date->toDateString(),
                $r->employee?->employee_no ?? '',
                ($r->employee?->last_name ?? '').', '.($r->employee?->first_name ?? ''),
                $r->employee?->department?->name ?? '',
                $r->actual_in?->format('H:i') ?? '',
                $r->actual_out?->format('H:i') ?? '',
                $r->hours_worked !== null ? (float) $r->hours_worked : '',
                (int) ($r->late_minutes ?? 0),
                (int) ($r->undertime_minutes ?? 0),
                (int) ($r->overtime_minutes ?? 0),
                (int) ($r->night_diff_minutes ?? 0),
                $r->dayStatus(),
            ];
        }

        return XlsxReport::download("dtr_{$request->date_from}_to_{$request->date_to}.xlsx", $headers, $data, [
            'title' => 'Daily Time Records',
            'subtitle' => "Period {$request->date_from} to {$request->date_to} · generated ".now()->format('M d, Y g:i A'),
        ]);
    }

    /**
     * GET /api/v1/reports/attendance-summary?date_from=&date_to=&employee_id=&department_id=
     * One row per employee for the period — the timekeeping totals (scheduled /
     * present / absent / leave days, late/UT/OT/night minutes, hours worked).
     */
    public function attendanceSummary(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        $request->validate([
            'date_from'     => ['required', 'date'],
            'date_to'       => ['required', 'date', 'after_or_equal:date_from'],
            'employee_id'   => ['nullable', 'integer'],
            'department_id' => ['nullable', 'integer'],
        ]);

        $agg = DailyTimeRecord::query()
            ->whereBetween('work_date', [$request->date_from, $request->date_to])
            ->when($request->employee_id, fn ($q) => $q->where('employee_id', $request->employee_id))
            ->when($request->department_id, fn ($q) => $q->whereHas('employee', fn ($e) => $e->where('department_id', $request->department_id)))
            // Organic staff only — agency workers are reported via the Agencies module.
            ->when(! $request->employee_id, fn ($q) => $q->whereHas('employee', fn ($e) => $e->whereDoesntHave('branch', fn ($b) => $b->where('is_agency', true))))
            ->selectRaw('employee_id,
                count(*) filter (where not is_rest_day) as scheduled_days,
                count(*) filter (where actual_in is not null) as present_days,
                count(*) filter (where is_absent) as absent_days,
                count(*) filter (where is_on_leave) as leave_days,
                coalesce(sum(hours_worked),0) as total_hours,
                coalesce(sum(late_minutes),0) as late_minutes,
                coalesce(sum(undertime_minutes),0) as ut_minutes,
                coalesce(sum(overtime_minutes),0) as ot_minutes,
                coalesce(sum(night_diff_minutes),0) as night_minutes')
            ->groupBy('employee_id')
            ->get()->keyBy('employee_id');

        $employees = Employee::query()
            ->whereIn('id', $agg->keys())
            ->with('department:id,name')
            ->orderBy('last_name')->orderBy('first_name')
            ->get(['id', 'employee_no', 'first_name', 'last_name', 'department_id']);

        $headers = [
            'Employee No', 'Name', 'Department',
            'Scheduled Days', 'Present', 'Absent', 'On Leave', 'Hours Worked',
            'Late (min)', 'Undertime (min)', 'OT (min)', 'Night Diff (min)',
        ];
        $data = [];
        foreach ($employees as $e) {
            $a = $agg->get($e->id);
            $data[] = [
                $e->employee_no,
                $e->last_name.', '.$e->first_name,
                $e->department?->name ?? '',
                (int) ($a->scheduled_days ?? 0),
                (int) ($a->present_days ?? 0),
                (int) ($a->absent_days ?? 0),
                (int) ($a->leave_days ?? 0),
                round((float) ($a->total_hours ?? 0), 2),
                (int) ($a->late_minutes ?? 0),
                (int) ($a->ut_minutes ?? 0),
                (int) ($a->ot_minutes ?? 0),
                (int) ($a->night_minutes ?? 0),
            ];
        }

        return XlsxReport::download("attendance_summary_{$request->date_from}_to_{$request->date_to}.xlsx", $headers, $data, [
            'title' => 'Attendance Summary',
            'subtitle' => "Period {$request->date_from} to {$request->date_to} · generated ".now()->format('M d, Y g:i A'),
        ]);
    }

    /**
     * GET /api/v1/reports/agency-attendance?branch_id=&date_from=&date_to=
     *
     * A clean, self-contained attendance workbook for ONE agency (branch), kept
     * completely separate from the company's other employees. Three sheets:
     * Summary, Daily Shifts (shift start/end + hours per person per day) and raw
     * Punch Records. Only the chosen agency's workers are ever included.
     */
    public function agencyAttendance(Request $request): BinaryFileResponse
    {
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        $data = $request->validate([
            'branch_id' => ['required', 'integer'],
            'date_from' => ['required', 'date'],
            'date_to'   => ['required', 'date', 'after_or_equal:date_from'],
            // Optional: scope the whole report to a single worker in this agency.
            'employee_id' => ['nullable', 'integer'],
        ]);

        // The branch must belong to the company the user is currently in.
        $branch = Branch::query()->find($data['branch_id']);
        abort_unless($branch && (int) $branch->company_id === (int) $user->active_company_id, 404, 'Agency not found in this company.');

        $from = $data['date_from'];
        $to = $data['date_to'];

        $employees = Employee::query()
            ->where('company_id', $branch->company_id)
            ->where('branch_id', $branch->id)
            ->when(! empty($data['employee_id']), fn ($q) => $q->where('id', $data['employee_id']))
            ->orderBy('last_name')->orderBy('first_name')
            ->get(['id', 'employee_no', 'first_name', 'last_name', 'biometric_user_id']);
        abort_if(! empty($data['employee_id']) && $employees->isEmpty(), 404, 'That worker is not in this agency.');
        $single = ! empty($data['employee_id']) ? $employees->first() : null;
        $empById = $employees->keyBy('id');
        $ids = $employees->pluck('id');

        $dtrs = DailyTimeRecord::query()
            ->whereIn('employee_id', $ids)
            ->whereBetween('work_date', [$from, $to])
            ->orderBy('work_date')
            ->get();

        $logs = TimeLog::query()
            ->whereIn('employee_id', $ids)
            ->whereBetween('logged_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->orderBy('logged_at')
            ->get(['employee_id', 'logged_at', 'direction', 'source', 'device_id']);

        $name = fn ($e) => $e ? trim($e->last_name.', '.$e->first_name) : '';
        $hm = fn ($t) => $t ? \Illuminate\Support\Carbon::parse($t)->format('h:i A') : '';
        $status = function ($r) {
            if ($r->is_on_leave) {
                return 'On Leave';
            }
            if ($r->holiday_type) {
                return ucwords(str_replace('_', ' ', $r->holiday_type));
            }
            if ($r->is_rest_day && ! $r->actual_in) {
                return 'Rest Day';
            }
            if ($r->is_absent) {
                return 'Absent';
            }

            return $r->actual_in ? 'Present' : '—';
        };

        // Reusable cell styles.
        $titleStyle = (new Style())->withFontBold(true)->withFontSize(15)->withFontColor('1E293B');
        $labelStyle = (new Style())->withFontBold(true)->withFontColor('334155');
        $headStyle = (new Style())->withFontBold(true)->withFontColor(Color::WHITE)->withBackgroundColor('1E293B');

        $options = new XlsxOptions();
        $options->setColumnWidth(24, 1);   // Employee No / labels
        $options->setColumnWidth(28, 2);   // Name / values
        $options->setColumnWidth(12, 3, 4, 5, 6, 7);
        $options->setColumnWidth(10, 8, 9, 10);
        $options->setColumnWidth(14, 11);

        $path = tempnam(sys_get_temp_dir(), 'agrep_').'.xlsx';
        $writer = new XlsxWriter($options);
        $writer->openToFile($path);

        // Sheet 1 — Summary
        $writer->getCurrentSheet()->setName('Summary');
        $present = $dtrs->whereNotNull('actual_in')->count();
        $writer->addRow(Row::fromValuesWithStyle([($branch->name ?? 'Agency').' — Attendance Report'], $titleStyle));
        $writer->addRow(Row::fromValues([]));
        $sumRow = function (string $label, $value) use ($writer, $labelStyle) {
            $writer->addRow(Row::fromValuesWithStyles([$label, $value], [$labelStyle, new Style()]));
        };
        $sumRow('Agency', $branch->name.($branch->code ? " ({$branch->code})" : ''));
        $sumRow('Period', "{$from}  to  {$to}");
        $sumRow('Employees', $employees->count());
        $sumRow('Employees with attendance', $dtrs->whereNotNull('actual_in')->pluck('employee_id')->unique()->count());
        $writer->addRow(Row::fromValues([]));
        $sumRow('Present day-records', $present);
        $sumRow('Absent day-records', $dtrs->where('is_absent', true)->count());
        $sumRow('On-leave day-records', $dtrs->where('is_on_leave', true)->count());
        $sumRow('Total hours worked', round((float) $dtrs->sum('hours_worked'), 2));
        $sumRow('Total late (min)', (int) $dtrs->sum('late_minutes'));
        $sumRow('Total overtime (min)', (int) $dtrs->sum('overtime_minutes'));
        $sumRow('Total punches', $logs->count());

        // Sheet 2 — Daily Shifts
        $writer->addNewSheetAndMakeItCurrent();
        $writer->getCurrentSheet()->setName('Daily Shifts');
        $writer->addRow(Row::fromValuesWithStyle(['Employee No', 'Name', 'Date', 'Day', 'Scheduled In', 'Shift Start', 'Shift End', 'Hours', 'Late (min)', 'OT (min)', 'Status'], $headStyle));
        foreach ($dtrs as $r) {
            $e = $empById->get($r->employee_id);
            $wd = \Illuminate\Support\Carbon::parse($r->work_date);
            $writer->addRow(Row::fromValues([
                (string) ($e->employee_no ?? ''),
                $name($e),
                $wd->format('Y-m-d'),
                $wd->format('D'),
                $hm($r->scheduled_in),
                $hm($r->actual_in),
                $hm($r->actual_out),
                $r->hours_worked !== null ? round((float) $r->hours_worked, 2) : '',
                (int) $r->late_minutes,
                (int) $r->overtime_minutes,
                $status($r),
            ]));
        }

        // Sheet 3 — Punch Records
        $writer->addNewSheetAndMakeItCurrent();
        $writer->getCurrentSheet()->setName('Punch Records');
        $writer->addRow(Row::fromValuesWithStyle(['Employee No', 'Name', 'Date', 'Time', 'Direction', 'Device', 'Source'], $headStyle));
        foreach ($logs as $l) {
            $e = $empById->get($l->employee_id);
            $ts = \Illuminate\Support\Carbon::parse($l->logged_at);
            $writer->addRow(Row::fromValues([
                (string) ($e->employee_no ?? ''),
                $name($e),
                $ts->format('Y-m-d'),
                $ts->format('h:i A'),
                strtoupper((string) $l->direction),
                (string) $l->device_id,
                (string) $l->source,
            ]));
        }

        $writer->close();

        $slug = \Illuminate\Support\Str::slug($single ? ($single->first_name.' '.$single->last_name) : ($branch->name ?: 'agency'));

        return response()
            ->download($path, "agency_{$slug}_attendance_{$from}_to_{$to}.xlsx", [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])
            ->deleteFileAfterSend(true);
    }

    /**
     * GET /api/v1/reports/agency-attendance-data?branch_id=&date_from=&date_to=&employee_id=
     * Same content as the agency workbook, but as JSON so it can be shown on screen.
     */
    public function agencyAttendanceData(Request $request): \Illuminate\Http\JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('attendance.view'), 403);

        $data = $request->validate([
            'branch_id' => ['required', 'integer'],
            'date_from' => ['required', 'date'],
            'date_to'   => ['required', 'date', 'after_or_equal:date_from'],
            'employee_id' => ['nullable', 'integer'],
        ]);

        $branch = Branch::query()->find($data['branch_id']);
        abort_unless($branch && (int) $branch->company_id === (int) $user->active_company_id, 404, 'Agency not found in this company.');

        $from = $data['date_from'];
        $to = $data['date_to'];

        $employees = Employee::query()
            ->where('company_id', $branch->company_id)->where('branch_id', $branch->id)
            ->when(! empty($data['employee_id']), fn ($q) => $q->where('id', $data['employee_id']))
            ->orderBy('last_name')->orderBy('first_name')
            ->get(['id', 'employee_no', 'first_name', 'last_name']);
        abort_if(! empty($data['employee_id']) && $employees->isEmpty(), 404, 'That worker is not in this agency.');
        $empById = $employees->keyBy('id');
        $ids = $employees->pluck('id');

        $dtrs = DailyTimeRecord::query()
            ->whereIn('employee_id', $ids)->whereBetween('work_date', [$from, $to])
            ->orderBy('work_date')->orderBy('employee_id')->get();

        $hm = fn ($t) => $t ? \Illuminate\Support\Carbon::parse($t)->format('h:i A') : null;
        $status = function ($r) {
            if ($r->is_on_leave) return 'On Leave';
            if ($r->holiday_type) return ucwords(str_replace('_', ' ', $r->holiday_type));
            if ($r->is_rest_day && ! $r->actual_in) return 'Rest Day';
            if ($r->is_absent) return 'Absent';

            return $r->actual_in ? 'Present' : '—';
        };

        $rows = $dtrs->map(function ($r) use ($empById, $hm, $status) {
            $e = $empById->get($r->employee_id);
            $wd = \Illuminate\Support\Carbon::parse($r->work_date);

            return [
                'employee_no' => $e->employee_no ?? '',
                'name' => $e ? trim($e->first_name.' '.$e->last_name) : '',
                'date' => $wd->format('Y-m-d'),
                'day' => $wd->format('D'),
                'shift_start' => $hm($r->actual_in),
                'shift_end' => $hm($r->actual_out),
                'hours' => $r->hours_worked !== null ? round((float) $r->hours_worked, 2) : null,
                'late' => (int) $r->late_minutes,
                'ot' => (int) $r->overtime_minutes,
                'status' => $status($r),
            ];
        })->values();

        return response()->json([
            'agency' => ['id' => $branch->id, 'name' => $branch->name],
            'from' => $from,
            'to' => $to,
            'summary' => [
                'employees' => $employees->count(),
                'present_days' => $dtrs->whereNotNull('actual_in')->count(),
                'absent_days' => $dtrs->where('is_absent', true)->count(),
                'leave_days' => $dtrs->where('is_on_leave', true)->count(),
                'total_hours' => round((float) $dtrs->sum('hours_worked'), 2),
            ],
            'rows' => $rows,
        ]);
    }

    /**
     * GET /api/v1/reports/ytd?year= — a Year-to-Date payroll workbook for the
     * active company: per-employee totals combining in-system payroll runs with
     * the prior-period carry-over (prev_* on the payroll profile), so a company
     * adopted mid-year still shows a correct full-year YTD. Mirrors the concepts of
     * the source YTD export (earnings, gov contributions, tax, net).
     */
    public function ytd(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);
        $companyId = $request->user()->active_company_id;
        abort_unless($companyId, 400, 'Switch to a company first.');
        $year = (int) ($request->query('year') ?: now()->year);
        $company = Company::find($companyId);

        // In-system payslip totals for the year, per employee.
        $agg = DB::table('payslips as p')
            ->join('payroll_runs as r', 'r.id', '=', 'p.payroll_run_id')
            ->where('p.company_id', $companyId)
            ->whereRaw('extract(year from r.period_end) = ?', [$year])
            ->whereIn('r.status', ['computed', 'approved', 'posted'])
            ->groupBy('p.employee_id')
            ->selectRaw('p.employee_id,
                coalesce(sum(p.basic_pay),0) basic, coalesce(sum(p.overtime_pay),0) ot,
                coalesce(sum(p.allowance),0) allow, coalesce(sum(p.de_minimis),0) demin,
                coalesce(sum(p.gross_pay),0) gross, coalesce(sum(p.sss),0) sss,
                coalesce(sum(p.philhealth),0) phil, coalesce(sum(p.pagibig),0) hdmf,
                coalesce(sum(p.withholding_tax),0) tax, coalesce(sum(p.loans_deduction),0) loans,
                coalesce(sum(p.net_pay),0) net')
            ->get()->keyBy('employee_id');

        $employees = Employee::query()
            ->where('company_id', $companyId)
            ->with(['position:id,title', 'department:id,name', 'compensation', 'payrollProfile'])
            ->orderBy('last_name')->orderBy('first_name')
            ->get();

        $titleStyle = (new Style())->withFontBold(true)->withFontSize(13)->withFontColor('1E293B');
        $head = (new Style())->withFontBold(true)->withFontColor(Color::WHITE)->withBackgroundColor('1E293B');

        $opt = new XlsxOptions();
        $opt->setColumnWidth(14, 1);
        $opt->setColumnWidth(26, 2);
        $opt->setColumnWidth(18, 3, 4);
        $opt->setColumnWidth(13, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18);

        $cols = ['Employee ID', 'Name', 'Position', 'Department', 'Status', 'Basic Rate', 'Pay Type',
            'YTD Basic', 'YTD OT', 'YTD Allowance', 'YTD De Minimis', 'YTD Gross',
            'YTD SSS', 'YTD PhilHealth', 'YTD HDMF', 'YTD Tax', 'YTD Loans', 'YTD Net',
            'Prior Taxable (carry-over)', 'Prior Tax (carry-over)', 'Prior 13th (carry-over)', 'Total YTD Taxable', 'Total YTD Tax'];

        $path = tempnam(sys_get_temp_dir(), 'ytd_').'.xlsx';
        $writer = new XlsxWriter($opt);
        $writer->openToFile($path);
        $writer->getCurrentSheet()->setName('YTD Summary');
        $writer->addRow(Row::fromValuesWithStyle([($company?->legal_name ?: 'Company').' — YTD Payroll '.$year], $titleStyle));
        $writer->addRow(Row::fromValues([]));
        $writer->addRow(Row::fromValuesWithStyle($cols, $head));

        foreach ($employees as $e) {
            $a = $agg->get($e->id);
            $comp = $e->compensation;
            $prof = $e->payrollProfile;
            $payType = $comp?->pay_type ?? 'monthly';
            $rate = $payType === 'daily' ? (float) ($comp?->daily_rate ?? 0) : (float) ($comp?->basic_monthly ?? 0);
            $priorTaxable = (float) ($prof?->prev_taxable_gross ?? 0);
            $priorTax = (float) ($prof?->prev_tax_withheld ?? 0);
            $prior13 = (float) ($prof?->prev_13th_month ?? 0);
            $ytdGross = (float) ($a->gross ?? 0);
            $ytdTax = (float) ($a->tax ?? 0);

            $writer->addRow(Row::fromValues([
                $e->employee_no, trim($e->first_name.' '.$e->last_name), $e->position?->title ?? '', $e->department?->name ?? '',
                $e->is_active ? 'Active' : 'Inactive', round($rate, 2), $payType,
                round((float) ($a->basic ?? 0), 2), round((float) ($a->ot ?? 0), 2), round((float) ($a->allow ?? 0), 2), round((float) ($a->demin ?? 0), 2), round($ytdGross, 2),
                round((float) ($a->sss ?? 0), 2), round((float) ($a->phil ?? 0), 2), round((float) ($a->hdmf ?? 0), 2), round($ytdTax, 2), round((float) ($a->loans ?? 0), 2), round((float) ($a->net ?? 0), 2),
                round($priorTaxable, 2), round($priorTax, 2), round($prior13, 2), round($ytdGross + $priorTaxable, 2), round($ytdTax + $priorTax, 2),
            ]));
        }

        $writer->close();
        $slug = \Illuminate\Support\Str::slug($company?->code ?: 'company');

        return response()->download($path, "{$slug}_ytd_{$year}.xlsx", [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    /** GET /api/v1/reports/compensation — active salaries for the company. */
    public function compensation(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);

        $rows = EmployeeCompensation::query()
            ->with('employee:id,employee_no,first_name,last_name,department_id', 'employee.department:id,name')
            ->where('is_active', true)
            // Internal payroll only — exclude agency workers (reported per agency).
            ->whereHas('employee', fn ($e) => $e->whereDoesntHave('branch', fn ($b) => $b->where('is_agency', true)))
            ->get();

        $headers = ['Employee No', 'Name', 'Department', 'Pay Type', 'Basic Monthly', 'Daily Rate', 'Hourly Rate', 'Allowance', 'Effective From'];
        $data = [];
        foreach ($rows->sortBy(fn ($c) => $c->employee?->last_name) as $c) {
            $data[] = [
                $c->employee?->employee_no ?? '',
                ($c->employee?->last_name ?? '').', '.($c->employee?->first_name ?? ''),
                $c->employee?->department?->name ?? '',
                $c->pay_type,
                (float) $c->basic_monthly, (float) $c->daily_rate, (float) $c->hourly_rate, (float) $c->allowance_monthly,
                $c->effective_from?->toDateString() ?? '',
            ];
        }

        return XlsxReport::download('compensation_'.now()->format('Ymd').'.xlsx', $headers, $data, [
            'title' => 'Compensation Report',
        ]);
    }

    /**
     * GET /api/v1/reports/thirteenth-month?year=
     * 13th-month pay = total BASIC salary earned in the year ÷ 12 (per DOLE).
     * Basic is summed from the year's payslips (computed/approved/posted runs).
     */
    public function thirteenthMonth(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);
        $year = (int) ($request->query('year') ?: now()->year);
        $companyId = $request->user()->active_company_id;

        $rows = DB::table('payslips as p')
            ->join('payroll_runs as r', 'r.id', '=', 'p.payroll_run_id')
            ->join('employees as e', 'e.id', '=', 'p.employee_id')
            ->leftJoin('departments as d', 'd.id', '=', 'e.department_id')
            ->where('p.company_id', $companyId)
            ->whereRaw('extract(year from r.period_end) = ?', [$year])
            ->whereIn('r.status', ['computed', 'approved', 'posted'])
            ->groupBy('e.id', 'e.employee_no', 'e.first_name', 'e.last_name', 'd.name')
            ->orderBy('e.last_name')
            ->selectRaw('e.employee_no, e.first_name, e.last_name, d.name as dept,
                coalesce(sum(p.basic_pay),0) as total_basic,
                count(distinct p.payroll_run_id) as cutoffs')
            ->get();

        $headers = ['Employee No', 'Name', 'Department', 'Cutoffs Paid', "Total Basic {$year}", '13th Month Pay'];
        $data = [];
        foreach ($rows as $r) {
            $data[] = [
                $r->employee_no,
                $r->last_name.', '.$r->first_name,
                $r->dept ?? '',
                (int) $r->cutoffs,
                round((float) $r->total_basic, 2),
                round(((float) $r->total_basic) / 12, 2),
            ];
        }

        return XlsxReport::download("13th_month_{$year}.xlsx", $headers, $data, [
            'title' => "13th Month Pay — {$year}",
        ]);
    }

    /**
     * GET /api/v1/reports/remittance?type=sss|philhealth|pagibig|tax&year=&month=
     * Monthly statutory remittance: employee-share (from the month's payslips) and
     * employer-share (computed), per employee, with the government ID. type=tax is
     * the BIR 1601-C withholding summary (employee side only).
     */
    public function remittance(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);
        $type = in_array($request->query('type'), ['sss', 'philhealth', 'pagibig', 'tax'], true) ? $request->query('type') : 'sss';
        $year = (int) ($request->query('year') ?: now()->year);
        $month = (int) ($request->query('month') ?: now()->month);
        $companyId = $request->user()->active_company_id;

        $eeCol = $type === 'tax' ? 'withholding_tax' : $type;

        // Employee-share totals from the month's payslips.
        $agg = DB::table('payslips as p')
            ->join('payroll_runs as r', 'r.id', '=', 'p.payroll_run_id')
            ->where('p.company_id', $companyId)
            ->whereRaw('extract(year from r.period_end) = ?', [$year])
            ->whereRaw('extract(month from r.period_end) = ?', [$month])
            ->whereIn('r.status', ['computed', 'approved', 'posted'])
            ->groupBy('p.employee_id')
            ->selectRaw("p.employee_id, coalesce(sum(p.$eeCol),0) as ee")
            ->get()->keyBy('employee_id');

        if ($agg->isEmpty()) {
            return XlsxReport::download("remittance_{$type}_{$year}_{$month}.xlsx", ['Notice'], [['No payroll for this month.']]);
        }

        $ids = $agg->keys();
        $employees = Employee::query()->whereIn('id', $ids)->orderBy('last_name')->get(['id', 'employee_no', 'first_name', 'last_name']);
        $govs = EmployeeGovernmentId::query()->whereIn('employee_id', $ids)->get()->keyBy('employee_id');
        $comps = EmployeeCompensation::query()->whereIn('employee_id', $ids)->where('is_active', true)->get()->keyBy('employee_id');
        $calc = app(StatutoryCalculator::class);

        $govField = ['sss' => 'sss_no', 'philhealth' => 'philhealth_no', 'pagibig' => 'pagibig_no', 'tax' => 'tin'][$type];
        $govLabel = ['sss' => 'SSS No', 'philhealth' => 'PhilHealth No', 'pagibig' => 'Pag-IBIG No', 'tax' => 'TIN'][$type];

        $period = date('F Y', mktime(0, 0, 0, $month, 1, $year));

        if ($type === 'tax') {
            $headers = ['TIN', 'Employee No', 'Name', 'Tax Withheld'];
            $data = [];
            foreach ($employees as $e) {
                $data[] = [
                    $govs->get($e->id)?->tin ?? '',
                    $e->employee_no,
                    $e->last_name.', '.$e->first_name,
                    round((float) ($agg->get($e->id)->ee ?? 0), 2),
                ];
            }
            $data[] = ['', '', 'TOTAL', round($agg->sum('ee'), 2)];

            return XlsxReport::download("bir_1601c_{$year}_{$month}.xlsx", $headers, $data, [
                'title' => "BIR 1601-C — Withholding Tax · {$period}",
            ]);
        }

        $headers = [$govLabel, 'Employee No', 'Name', 'Monthly Basic', 'Employee Share', 'Employer Share', 'Total'];
        $data = [];
        foreach ($employees as $e) {
            $monthly = $this->monthlyBasic($comps->get($e->id));
            $er = $calc->monthlyEmployerContributions($monthly)[$type] ?? 0;
            $ee = round((float) ($agg->get($e->id)->ee ?? 0), 2);
            $data[] = [
                $govs->get($e->id)?->{$govField} ?? '',
                $e->employee_no,
                $e->last_name.', '.$e->first_name,
                round($monthly, 2),
                $ee,
                round((float) $er, 2),
                round($ee + (float) $er, 2),
            ];
        }

        return XlsxReport::download("remittance_{$type}_{$year}_{$month}.xlsx", $headers, $data, [
            'title' => strtoupper($type)." Remittance · {$period}",
        ]);
    }

    /** Monthly-equivalent basic salary from a compensation record. */
    private function monthlyBasic(?EmployeeCompensation $c): float
    {
        if (! $c) {
            return 0.0;
        }
        return match ($c->pay_type) {
            'daily' => (float) $c->daily_rate * 22,
            'hourly' => (float) $c->hourly_rate * 8 * 22,
            default => (float) $c->basic_monthly,
        };
    }

    /** GET /api/v1/reports/leave?date_from=&date_to=&status= */
    public function leave(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to'   => ['nullable', 'date'],
            'status'    => ['nullable', 'string'],
        ]);

        $rows = LeaveApplication::query()
            ->with('employee:id,employee_no,first_name,last_name')
            ->with('leaveType:id,name')
            ->when($request->date_from, fn ($q) => $q->where('date_from', '>=', $request->date_from))
            ->when($request->date_to,   fn ($q) => $q->where('date_to', '<=', $request->date_to))
            ->when($request->status,    fn ($q) => $q->where('status', $request->status))
            ->orderBy('date_from', 'desc')
            ->get();

        $headers = [
            'Employee No', 'Name', 'Leave Type',
            'Start Date', 'End Date', 'Days', 'Status', 'Remarks',
        ];
        $data = [];
        foreach ($rows as $r) {
            $data[] = [
                $r->employee?->employee_no ?? '',
                ($r->employee?->last_name ?? '').', '.($r->employee?->first_name ?? ''),
                $r->leaveType?->name ?? '',
                $r->date_from?->toDateString() ?? '',
                $r->date_to?->toDateString() ?? '',
                $r->days_count !== null ? (float) $r->days_count : '',
                $r->status,
                $r->decision_remarks ?? '',
            ];
        }

        $suffix = $request->date_from ? "_{$request->date_from}_to_{$request->date_to}" : '';

        return XlsxReport::download("leave_report{$suffix}.xlsx", $headers, $data, [
            'title' => 'Leave Report',
        ]);
    }

    public function overtime(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('attendance.view'), 403);

        $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to'   => ['nullable', 'date'],
            'status'    => ['nullable', 'string'],
        ]);

        $rows = OvertimeRequest::query()
            ->with('employee:id,employee_no,first_name,last_name')
            ->when($request->date_from, fn ($q) => $q->where('date', '>=', $request->date_from))
            ->when($request->date_to,   fn ($q) => $q->where('date', '<=', $request->date_to))
            ->when($request->status,    fn ($q) => $q->where('status', $request->status))
            ->orderBy('date', 'desc')
            ->get();

        $headers = [
            'Employee No', 'Name', 'Date', 'Start', 'End',
            'Hours', 'Classification', 'Status', 'Reason',
        ];
        $data = [];
        foreach ($rows as $r) {
            $data[] = [
                $r->employee?->employee_no ?? '',
                ($r->employee?->last_name ?? '').', '.($r->employee?->first_name ?? ''),
                $r->date?->toDateString() ?? '',
                $r->start_time,
                $r->end_time,
                $r->requested_hours !== null ? (float) $r->requested_hours : '',
                $r->classification ?? '',
                $r->status,
                $r->reason ?? '',
            ];
        }

        $suffix = $request->date_from ? "_{$request->date_from}_to_{$request->date_to}" : '';

        return XlsxReport::download("overtime_report{$suffix}.xlsx", $headers, $data, [
            'title' => 'Overtime Report',
        ]);
    }

    /** GET /api/v1/reports/payroll/{payrollRunId} */
    public function payroll(Request $request, int $payrollRunId): BinaryFileResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);

        $rows = Payslip::query()
            ->with('employee:id,employee_no,first_name,last_name')
            ->with('run:id,name,period_start,period_end,pay_date')
            ->where('payroll_run_id', $payrollRunId)
            ->orderBy('employee_id')
            ->get();

        abort_if($rows->isEmpty(), 404, 'Payroll run not found or has no payslips.');

        $run = $rows->first()->run;

        $headers = [
            'Employee No', 'Name',
            'Days Worked', 'Days Absent', 'Late (min)', 'OT (min)',
            'Basic Pay', 'OT Pay', 'Night Diff', 'Holiday Pay', 'Rest Day Pay', 'Allowance', 'De Minimis', 'Gross Pay',
            'SSS', 'PhilHealth', 'Pag-IBIG', 'W/Tax',
            'Absence Deduction', 'Tardiness Deduction', 'Loans', 'Total Deductions',
            'Net Pay',
        ];
        $data = [];
        foreach ($rows as $r) {
            $data[] = [
                $r->employee?->employee_no ?? '',
                ($r->employee?->last_name ?? '').', '.($r->employee?->first_name ?? ''),
                (float) $r->days_worked,
                (float) $r->days_absent,
                (int) $r->late_minutes,
                (int) $r->overtime_minutes,
                (float) $r->basic_pay,
                (float) $r->overtime_pay,
                (float) $r->night_diff_pay,
                (float) $r->holiday_pay,
                (float) $r->rest_day_pay,
                (float) $r->allowance,
                (float) $r->de_minimis,
                (float) $r->gross_pay,
                (float) $r->sss,
                (float) $r->philhealth,
                (float) $r->pagibig,
                (float) $r->withholding_tax,
                (float) $r->absences_deduction,
                (float) $r->tardiness_deduction,
                (float) $r->loans_deduction,
                (float) $r->total_deductions,
                (float) $r->net_pay,
            ];
        }

        $label = $run ? str_replace(' ', '_', $run->name) : $payrollRunId;

        return XlsxReport::download("payroll_{$label}.xlsx", $headers, $data, [
            'title' => 'Payroll Register'.($run ? ' — '.$run->name : ''),
            'subtitle' => $run ? "Period {$run->period_start} to {$run->period_end}" : 'Generated '.now()->format('M d, Y g:i A'),
        ]);
    }

    /**
     * GET /api/v1/reports/full-export
     * Dumps every category of the ACTIVE company's data into one XLSX file per
     * category, bundled into a single ZIP. Each sheet respects its own view
     * permission; the whole thing is company-scoped like the rest of the app.
     */
    public function fullExport(Request $request): BinaryFileResponse
    {
        $user = $request->user();
        abort_unless($user->can('employee.view'), 403);
        abort_unless($user->active_company_id, 400, 'Switch to a company first.');

        $canAttendance = $user->can('attendance.view');
        $canPayroll    = $user->can('payroll.view');
        $canSensitive  = $user->can('employee.view.sensitive');

        $company = Company::find($user->active_company_id);
        $code = $company?->code ?: ('company'.$user->active_company_id);

        $files = []; // archive name => temp path

        $add = function (string $name, array $headers, iterable $rows, callable $map) use (&$files): void {
            $path = tempnam(sys_get_temp_dir(), 'exp');
            $writer = new XlsxWriter();
            $writer->openToFile($path);
            $writer->addRow(Row::fromValues($headers));
            foreach ($rows as $item) {
                $writer->addRow(Row::fromValues(array_map(static fn ($v) => $v ?? '', $map($item))));
            }
            $writer->close();
            $files[$name] = $path;
        };

        // 1. Employees (always — gated by employee.view above)
        $add('01_Employees.xlsx',
            ['Employee No', 'Last Name', 'First Name', 'Middle Name', 'Suffix', 'Gender', 'Civil Status', 'Birth Date', 'Department', 'Position', 'Location', 'Employment Type', 'Date Hired', 'Date Separated', 'Active', 'Company Email', 'Biometric ID', 'Confidential'],
            Employee::with('department:id,name', 'position:id,title', 'branch:id,name', 'employmentType:id,name')->orderBy('last_name')->orderBy('first_name')->lazy(500),
            static fn ($e) => [
                $e->employee_no, $e->last_name, $e->first_name, $e->middle_name, $e->suffix,
                $e->gender, $e->civil_status, $e->birth_date?->toDateString(),
                $e->department?->name, $e->position?->title, $e->branch?->name, $e->employmentType?->name,
                $e->date_hired?->toDateString(), $e->date_separated?->toDateString(),
                $e->is_active ? 'Active' : 'Inactive', $e->email_company, $e->biometric_user_id,
                $e->is_confidential ? 'Yes' : 'No',
            ]);

        // 2. Compensation / salaries (sensitive)
        if ($canPayroll || $canSensitive) {
            $add('02_Compensation.xlsx',
                ['Employee No', 'Name', 'Pay Type', 'Basic Monthly', 'Daily Rate', 'Monthly Allowance', 'Effective From', 'Active'],
                EmployeeCompensation::with('employee:id,employee_no,first_name,last_name')->where('is_active', true)->lazy(500),
                static fn ($c) => [
                    $c->employee?->employee_no,
                    trim(($c->employee?->last_name ?? '').', '.($c->employee?->first_name ?? '')),
                    $c->pay_type, $c->basic_monthly, $c->daily_rate, $c->allowance_monthly,
                    $c->effective_from?->toDateString(), $c->is_active ? 'Yes' : 'No',
                ]);
        }

        if ($canAttendance) {
            // 3. Time logs (raw punches)
            $add('03_TimeLogs.xlsx',
                ['Logged At', 'Employee No', 'Name', 'Direction', 'Source', 'Device', 'Location'],
                TimeLog::with('employee:id,employee_no,first_name,last_name,branch_id', 'employee.branch:id,name', 'device:id,serial_no,name')->orderByDesc('logged_at')->lazy(1000),
                static fn ($l) => [
                    $l->logged_at?->format('Y-m-d h:i:s A'),
                    $l->employee?->employee_no,
                    trim(($l->employee?->last_name ?? '').', '.($l->employee?->first_name ?? '')),
                    $l->direction, $l->source, $l->device?->name ?? $l->device_id, $l->employee?->branch?->name,
                ]);

            // 4. Daily time records
            $add('04_DailyTimeRecords.xlsx',
                ['Date', 'Employee No', 'Name', 'Time In', 'Time Out', 'Hours Worked', 'Late (min)', 'Undertime (min)', 'OT (min)', 'Night Diff (min)', 'Status'],
                DailyTimeRecord::with('employee:id,employee_no,first_name,last_name')->orderByDesc('work_date')->lazy(1000),
                static fn ($r) => [
                    $r->work_date?->toDateString(), $r->employee?->employee_no,
                    trim(($r->employee?->last_name ?? '').', '.($r->employee?->first_name ?? '')),
                    $r->actual_in?->format('H:i'), $r->actual_out?->format('H:i'), $r->hours_worked,
                    $r->late_minutes, $r->undertime_minutes, $r->overtime_minutes, $r->night_diff_minutes,
                    method_exists($r, 'dayStatus') ? $r->dayStatus() : ($r->status ?? ''),
                ]);

            // 5. Leave applications
            $add('05_Leave.xlsx',
                ['Employee No', 'Name', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status', 'Remarks'],
                LeaveApplication::with('employee:id,employee_no,first_name,last_name', 'leaveType:id,name')->orderByDesc('date_from')->lazy(500),
                static fn ($r) => [
                    $r->employee?->employee_no,
                    trim(($r->employee?->last_name ?? '').', '.($r->employee?->first_name ?? '')),
                    $r->leaveType?->name, $r->date_from?->toDateString(), $r->date_to?->toDateString(),
                    $r->days_count, $r->status, $r->decision_remarks,
                ]);

            // 6. Overtime requests
            $add('06_Overtime.xlsx',
                ['Employee No', 'Name', 'Date', 'Start', 'End', 'Hours', 'Classification', 'Status', 'Reason'],
                OvertimeRequest::with('employee:id,employee_no,first_name,last_name')->orderByDesc('date')->lazy(500),
                static fn ($r) => [
                    $r->employee?->employee_no,
                    trim(($r->employee?->last_name ?? '').', '.($r->employee?->first_name ?? '')),
                    $r->date?->toDateString(), $r->start_time, $r->end_time, $r->requested_hours,
                    $r->classification, $r->status, $r->reason,
                ]);

            // 8. Devices
            $add('08_Devices.xlsx',
                ['Name', 'Serial', 'Location', 'Active', 'Last Event', 'Last Synced'],
                AttendanceDevice::with('branch:id,name')->orderBy('name')->lazy(200),
                static fn ($d) => [
                    $d->name, $d->serial_no, $d->branch?->name, $d->is_active ? 'Yes' : 'No',
                    $d->last_event_at?->toDateTimeString(), $d->last_synced_at?->toDateTimeString(),
                ]);
        }

        // 7. Payslips (sensitive)
        if ($canPayroll) {
            $add('07_Payslips.xlsx',
                ['Payroll Run', 'Employee No', 'Name', 'Days Worked', 'Days Absent', 'Late (min)', 'OT (min)', 'Basic Pay', 'OT Pay', 'Night Diff', 'Allowance', 'Gross Pay', 'SSS', 'PhilHealth', 'Pag-IBIG', 'W/Tax', 'Total Deductions', 'Net Pay'],
                Payslip::with('employee:id,employee_no,first_name,last_name', 'run:id,name')->orderByDesc('id')->lazy(500),
                static fn ($p) => [
                    $p->run?->name, $p->employee?->employee_no,
                    trim(($p->employee?->last_name ?? '').', '.($p->employee?->first_name ?? '')),
                    $p->days_worked, $p->days_absent, $p->late_minutes, $p->overtime_minutes,
                    $p->basic_pay, $p->overtime_pay, $p->night_diff_pay, $p->allowance, $p->gross_pay,
                    $p->sss, $p->philhealth, $p->pagibig, $p->withholding_tax, $p->total_deductions, $p->net_pay,
                ]);
        }

        // Bundle every sheet into one ZIP.
        $zipPath = tempnam(sys_get_temp_dir(), 'zip');
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);
        foreach ($files as $name => $path) {
            $zip->addFile($path, $name);
        }
        $zip->close();
        // Safe now that the archive is written — the per-sheet temp files were copied in.
        foreach ($files as $path) {
            @unlink($path);
        }

        $filename = "{$code}_full_export_".now()->format('Ymd_His').'.zip';

        return response()->download($zipPath, $filename, ['Content-Type' => 'application/zip'])
            ->deleteFileAfterSend(true);
    }
}
