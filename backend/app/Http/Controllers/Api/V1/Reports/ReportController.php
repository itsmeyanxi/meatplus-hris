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
use App\Domain\Leave\Models\LeaveBalance;
use App\Domain\Leave\Models\LeaveType;
use App\Domain\HRIS\Models\EmployeeBankAccount;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\EmployeePayrollProfile;
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
    /**
     * The 39-column "MANUAL TIMEKEEPING" worksheet layout (Pacific template):
     * a per-employee-per-day punch/hours block (A–X) followed by the salary
     * computation block (Y–AM). Column order is fixed — do not reorder.
     */
    private const TIMEKEEPING_HEADERS = [
        'LAST NAME', 'FIRST NAME', 'DATE', 'SCHEDULE', 'IN', 'OUT', 'OT (IN)', 'OT(OUT)',
        'LATE (HR)', 'REG (HRS)', 'REG ND (HRS)', 'REG OT (HR)', 'REG ND OT (HRS)',
        'RD REG (HRS)', 'RD REG ND (HRS)', 'RD OT (HR)', 'RH (HRS)', 'LH (HR)', 'LH OT (HRS)',
        'SH (HR)', 'SH ND(HR)', 'SH OT(HR)', 'SH OT (ND)', 'REMARKS',
        'Employee ID', 'Employee Name', 'Monthly Rate', 'Daily Rate', 'HOURLY Rate',
        'LATE DEDUCTION', 'REG (HRS)', 'REG ND (HR)', 'REG OT (HR)', 'REG OT (ND) HRS',
        'RD HRS', 'RD OT HRS', 'LH (HR)', 'SUB TOTAL', 'TOTAL SALARY',
    ];

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
            // Keep agency workers out of the company's internal timekeeping — they have
            // their own per-agency report. An explicit employee_id still returns anyone.
            ->when(! $request->employee_id, fn ($q) => $q->whereHas(
                'employee', fn ($e) => $e->whereDoesntHave('branch', fn ($b) => $b->where('is_agency', true)->orWhere('is_project_crew', true))
            ))
            ->get();

        // Monthly rate per employee drives the salary computations (Daily = Monthly/313*12).
        $rates = EmployeeCompensation::query()
            ->whereIn('employee_id', $rows->pluck('employee_id')->unique())
            ->where('is_active', true)
            ->pluck('basic_monthly', 'employee_id');

        // Group by department, then employee (last name), then date — one row per day.
        $byDept = $rows
            ->groupBy(fn ($r) => $r->employee?->department?->name ?: 'Unassigned')
            ->sortKeys();

        $data = [];
        $grand = 0.0;
        foreach ($byDept as $deptName => $deptRows) {
            $band = array_fill(0, count(self::TIMEKEEPING_HEADERS), '');
            $band[0] = strtoupper((string) $deptName);
            $data[] = $band;

            $deptTotal = 0.0;
            $ordered = $deptRows->sortBy(fn ($r) => sprintf(
                '%s|%s|%s',
                $r->employee?->last_name ?? '',
                $r->employee?->first_name ?? '',
                $r->work_date->toDateString(),
            ));
            foreach ($ordered as $r) {
                [$row, $total] = $this->timekeepingRow($r, (float) ($rates[$r->employee_id] ?? 0));
                $data[] = $row;
                $deptTotal += $total;
            }

            $sub = array_fill(0, count(self::TIMEKEEPING_HEADERS), '');
            $sub[25] = 'DEPARTMENT TOTAL';
            $sub[38] = round($deptTotal, 2);
            $data[] = $sub;
            $grand += $deptTotal;
        }
        if (count($byDept) > 1) {
            $g = array_fill(0, count(self::TIMEKEEPING_HEADERS), '');
            $g[25] = 'GRAND TOTAL';
            $g[38] = round($grand, 2);
            $data[] = $g;
        }

        $company = Company::find($request->user()->active_company_id);
        $companyName = $company?->legal_name ?: $company?->trade_name ?: 'TIMEKEEPING';
        $period = strtoupper(date('F j, Y', strtotime($request->date_from)))
            .' TO '.strtoupper(date('F j, Y', strtotime($request->date_to)));

        return XlsxReport::download(
            "timekeeping_{$request->date_from}_to_{$request->date_to}.xlsx",
            self::TIMEKEEPING_HEADERS,
            $data,
            [
                'title' => $companyName,
                'subtitle' => "{$period}  ·  CUT OFF PERIOD",
                'sheet' => 'TIMEKEEPING',
                // Section band = department name (empty DATE, filled col A); totals carry a label in Employee Name.
                'emphasize' => function ($row) {
                    if (($row[2] ?? '') === '' && ($row[0] ?? '') !== '') {
                        return 'header';
                    }
                    if (in_array($row[25] ?? '', ['DEPARTMENT TOTAL', 'GRAND TOTAL'], true)) {
                        return 'total';
                    }

                    return null;
                },
            ]
        );
    }

    /**
     * Build one TIMEKEEPING row for a day's DTR, pre-filled from attendance, with the
     * salary block computed exactly as the template's formulas:
     *   Daily = Monthly/313*12 · Hourly = Daily/8 · pay = Hourly × multiplier × hours.
     * Late deduction is written as a negative so SUB TOTAL = SUM(late..LH) nets it out.
     * Buckets we don't store per day (RD-ND-OT, holiday ND/OT) stay blank for manual entry.
     *
     * @return array{0: array<int, mixed>, 1: float}  [row, totalSalary]
     */
    private function timekeepingRow(DailyTimeRecord $r, float $monthly): array
    {
        $emp = $r->employee;
        $daily = $monthly > 0 ? $monthly / 313 * 12 : 0.0;
        $hourly = $daily / 8;

        $lateHrs = round(((int) ($r->late_minutes ?? 0)) / 60, 2);
        $worked = (float) ($r->hours_worked ?? 0);
        $ndHrs = round(((int) ($r->night_diff_minutes ?? 0)) / 60, 2);
        $otHrs = round(((int) ($r->overtime_minutes ?? 0)) / 60, 2);

        // Hour buckets by day type (only J,K,L,M,N,P,R feed the salary formulas).
        $J = $K = $L = $M = $N = $O = $P = $Q = $RH = $LHh = $LHot = $SH = $SHnd = $SHot = $SHotNd = 0.0;
        $ht = strtolower((string) ($r->holiday_type ?? ''));
        if ($r->is_absent) {
            $remark = 'ABSENT';
        } elseif ($r->is_on_leave) {
            $remark = 'ON LEAVE';
        } elseif ($ht !== '' && str_contains($ht, 'special')) {
            $SH = $worked;                                   // special holiday — recorded, paid manually
            $remark = 'SPECIAL HOLIDAY';
        } elseif ($ht !== '') {
            $LHh = min($worked, 8.0);                         // regular/legal holiday — 2× via LH
            $LHot = max(0.0, $worked - 8.0);
            $remark = 'HOLIDAY';
        } elseif ($r->is_rest_day) {
            $N = min($worked, 8.0);                           // rest day — 1.3× first 8h, 1.69× beyond
            $P = max(0.0, $worked - 8.0);
            $remark = 'REST DAY';
        } else {
            $L = $otHrs;                                      // regular day: split worked into day/night/OT
            $K = $ndHrs;
            $J = max(0.0, round($worked - $ndHrs - $otHrs, 2));
            $remark = '';
        }

        // Salary block (template formulas, evaluated). Late deduction is negative.
        $lateDed = -1 * $hourly * $lateHrs;
        $regP = $hourly * $J;
        $regNdP = $hourly * 1.1 * $K;
        $regOtP = $hourly * 1.25 * $L;
        $regOtNdP = $hourly * 1.25 * 1.1 * $M;
        $rdP = $hourly * 1.3 * $N;
        $rdOtP = $hourly * 1.69 * $P;
        $lhP = $hourly * 2 * $LHh;
        $subtotal = $lateDed + $regP + $regNdP + $regOtP + $regOtNdP + $rdP + $rdOtP + $lhP;

        $hm = fn (?string $col) => $r->{$col}?->format('H:i') ?? '';
        $sched = ($r->scheduled_in && $r->scheduled_out) ? $hm('scheduled_in').'-'.$hm('scheduled_out') : '';
        $hr = fn (float $x) => $x > 0.0001 ? round($x, 2) : '';        // blank instead of 0 for hour cells
        $money = fn (float $x) => abs($x) > 0.0001 ? round($x, 2) : ''; // blank instead of 0 for peso cells

        $row = [
            $emp?->last_name ?? '', $emp?->first_name ?? '',              // A,B
            $r->work_date->format('n/j/Y'), $sched,                       // C,D
            $hm('actual_in'), $hm('actual_out'), '', '',                  // E,F,G,H
            $hr($lateHrs),                                                // I LATE (HR)
            $hr($J), $hr($K), $hr($L), $hr($M),                           // J,K,L,M
            $hr($N), $hr($O), $hr($P),                                    // N,O,P
            $hr($Q), $hr($LHh), $hr($LHot),                               // Q RH, R LH, S LH OT
            $hr($SH), $hr($SHnd), $hr($SHot), $hr($SHotNd),               // T,U,V,W
            $remark,                                                      // X REMARKS
            $emp?->employee_no ?? '',                                     // Y Employee ID
            trim(($emp?->last_name ?? '').', '.($emp?->first_name ?? '')),// Z Employee Name
            $monthly > 0 ? round($monthly, 2) : '',                       // AA Monthly Rate
            $monthly > 0 ? round($daily, 2) : '',                         // AB Daily Rate
            $monthly > 0 ? round($hourly, 2) : '',                        // AC Hourly Rate
            $money($lateDed),                                            // AD Late Deduction
            $money($regP), $money($regNdP), $money($regOtP), $money($regOtNdP), // AE..AH
            $money($rdP), $money($rdOtP), $money($lhP),                   // AI,AJ,AK
            round($subtotal, 2), round($subtotal, 2),                    // AL SUB TOTAL, AM TOTAL SALARY
        ];

        return [$row, $subtotal];
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
            ->when(! $request->employee_id, fn ($q) => $q->whereHas('employee', fn ($e) => $e->whereDoesntHave('branch', fn ($b) => $b->where('is_agency', true)->orWhere('is_project_crew', true))))
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
            ->whereHas('employee', fn ($e) => $e->whereDoesntHave('branch', fn ($b) => $b->where('is_agency', true)->orWhere('is_project_crew', true)))
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

        // SSS gets the full R3 breakdown: Regular SS + MPF/WISP + EC, each split EE/ER.
        if ($type === 'sss') {
            $headers = [
                $govLabel, 'Employee No', 'Name', 'Monthly Basic', 'MSC',
                'Reg SS EE', 'Reg SS ER', 'MPF/WISP EE', 'MPF/WISP ER', 'EC (ER)',
                'Employee Share', 'Employer Share', 'Total',
            ];
            $data = [];
            $tot = array_fill(0, 8, 0.0); // msc, regEe, regEr, wispEe, wispEr, ec, eeTot, erTot
            foreach ($employees as $e) {
                $monthly = $this->monthlyBasic($comps->get($e->id));
                $b = $calc->sssBreakdown($monthly);
                $data[] = [
                    $govs->get($e->id)?->{$govField} ?? '',
                    $e->employee_no,
                    $e->last_name.', '.$e->first_name,
                    round($monthly, 2),
                    round($b['msc'], 2),
                    $b['regular_ee'], $b['regular_er'], $b['wisp_ee'], $b['wisp_er'], $b['ec'],
                    $b['ee_total'], $b['er_total'],
                    round($b['ee_total'] + $b['er_total'], 2),
                ];
                foreach (['msc', 'regular_ee', 'regular_er', 'wisp_ee', 'wisp_er', 'ec', 'ee_total', 'er_total'] as $i => $k) {
                    $tot[$i] += $b[$k];
                }
            }
            $data[] = [
                '', '', 'TOTAL', '', round($tot[0], 2),
                round($tot[1], 2), round($tot[2], 2), round($tot[3], 2), round($tot[4], 2), round($tot[5], 2),
                round($tot[6], 2), round($tot[7], 2), round($tot[6] + $tot[7], 2),
            ];

            return XlsxReport::download("remittance_sss_r3_{$year}_{$month}.xlsx", $headers, $data, [
                'title' => "SSS R3 Remittance (Regular SS + MPF/WISP + EC) · {$period}",
                'emphasize' => fn ($row) => ($row[2] ?? '') === 'TOTAL' ? 'total' : null,
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

        // Preload each employee's leave-credit balances (keyed employee|type|year).
        $empIds = $rows->pluck('employee_id')->filter()->unique()->all();
        $balances = [];
        foreach (LeaveBalance::query()->whereIn('employee_id', $empIds)->get() as $b) {
            $balances[$b->employee_id.'|'.$b->leave_type_id.'|'.$b->year] = $b;
        }

        // Every credit-tracked leave type in the company becomes its own
        // "remaining" column, so each row shows the employee's remaining credits
        // across ALL leave types (not just the one on that row).
        $companyId = $request->user()->active_company_id;
        $creditTypes = LeaveType::query()
            ->where('company_id', $companyId)
            ->where('is_paid', true)
            ->where('default_credits_per_year', '>', 0)
            ->orderBy('name')
            ->get(['id', 'name']);

        // Columns mirror a Sprout LeaveReport (Employee, type, filed/from/to dates,
        // paid vs unpaid days, reason, status, approved date), then the credit
        // balances: "Remaining Balance" for THIS leave's type, followed by a
        // per-type column for every credit-tracked leave type.
        $headers = [
            'Employee No', 'Name', 'Leave Type', 'Date Filed', 'Date From', 'Date To',
            'With Pay Days', 'Without Pay Days', 'Reason', 'Status', 'Approved Date', 'Remaining Balance',
        ];
        foreach ($creditTypes as $t) {
            $headers[] = $t->name.' (remaining)';
        }
        $headers[] = 'Remarks';

        $asDate = fn ($v) => $v ? \Illuminate\Support\Carbon::parse($v)->toDateString() : '';

        $data = [];
        foreach ($rows as $r) {
            $year = $r->date_from?->year;
            $ownBal = $balances["{$r->employee_id}|{$r->leave_type_id}|{$year}"] ?? null;
            // An explicit import split (Sprout) wins. Otherwise split by the
            // application's paid/unpaid flag: unpaid puts the days in Without-Pay,
            // paid (or a legacy row with no flag) in With-Pay.
            if ($r->with_pay_days !== null || $r->without_pay_days !== null) {
                $withPay = (float) ($r->with_pay_days ?? 0);
                $withoutPay = (float) ($r->without_pay_days ?? 0);
            } elseif ($r->is_paid === false) {
                $withPay = 0.0;
                $withoutPay = (float) $r->days_count;
            } else {
                $withPay = (float) $r->days_count;
                $withoutPay = 0.0;
            }

            $row = [
                $r->employee?->employee_no ?? '',
                trim(($r->employee?->last_name ?? '').', '.($r->employee?->first_name ?? '')),
                $r->leaveType?->name ?? '',
                $asDate($r->submitted_at),
                $r->date_from?->toDateString() ?? '',
                $r->date_to?->toDateString() ?? '',
                $withPay,
                $withoutPay,
                $r->reason ?? '',
                $r->status,
                $asDate($r->decided_at),
                $ownBal ? round((float) $ownBal->current_balance, 2) : '',
            ];
            // Remaining credits per leave type for this employee (this leave's year).
            foreach ($creditTypes as $t) {
                $bal = $balances["{$r->employee_id}|{$t->id}|{$year}"] ?? null;
                $row[] = $bal ? round((float) $bal->current_balance, 2) : '';
            }
            $row[] = $r->decision_remarks ?? '';
            $data[] = $row;
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
            ->with([
                'employee:id,employee_no,first_name,middle_name,last_name,gender,date_hired,is_active,is_confidential,department_id,position_id,employment_type_id',
                'employee.department:id,name', 'employee.position:id,title', 'employee.employmentType:id,name',
            ])
            ->with('run:id,name,company_id,period_start,period_end,pay_date')
            ->where('payroll_run_id', $payrollRunId)
            ->get();

        abort_if($rows->isEmpty(), 404, 'Payroll run not found or has no payslips.');

        $run = $rows->first()->run;
        $companyId = $run->company_id;
        $empIds = $rows->pluck('employee_id')->unique()->all();

        // Supplementary per-employee data the register needs beyond the payslip.
        $comp = EmployeeCompensation::withoutGlobalScopes()->whereIn('employee_id', $empIds)
            ->where('is_active', true)->get()->keyBy('employee_id');
        $prof = EmployeePayrollProfile::whereIn('employee_id', $empIds)->get()->keyBy('employee_id');
        $bank = EmployeeBankAccount::query()->whereIn('employee_id', $empIds)
            ->orderByDesc('is_primary')->get()->groupBy('employee_id')->map->first();
        // Year-to-date tax + net across this company's runs up to this period.
        $ytd = DB::table('payslips as p')->join('payroll_runs as r', 'r.id', '=', 'p.payroll_run_id')
            ->where('p.company_id', $companyId)->whereIn('p.employee_id', $empIds)
            ->whereYear('r.period_end', $run->period_end->year)
            ->whereDate('r.period_end', '<=', $run->period_end->toDateString())
            ->groupBy('p.employee_id')
            ->select('p.employee_id', DB::raw('SUM(p.withholding_tax) tax'), DB::raw('SUM(p.net_pay) net'))
            ->get()->keyBy('employee_id');
        $statutory = app(StatutoryCalculator::class);

        $hhmm = fn (int $min) => sprintf('%02d:%02d', intdiv(max(0, $min), 60), max(0, $min) % 60);

        // Columns mirror the Sprout PayrollSummary "Payroll Register" 1:1.
        $headers = [
            'Employee ID*', 'Fullname', 'Position', 'Department', 'Date Hired', 'Employment Status',
            'Bank Account Number', 'Cost Center', 'Gender', 'Work Days Per Year',
            'Basic Monthly Salary', 'Monthly De Minimis Benefits', 'Total Monthly Salary', 'Basic Salary (Semi-Monthly)',
            'Gross/Day', 'Basic/Hr (8 hours)', 'De Minimis Benefits (Semi-Monthly)',
            'BASIC ADJUSTMENT', 'Communication Allowance', 'Overtime Adjustment', 'Representation',
            'Ord-ND', 'Ord-ND(hh:mm)', 'Ord-OT', 'Ord-OT(hh:mm)', 'RD', 'RD(hh:mm)', 'OT Total', 'Total Salary',
            'Days Worked', 'Days Absent', 'Total Absent Deduction', 'Deminimis Deduction', 'Allowance Absent Deduction',
            'Discretionary Deduction', 'Minutes Late', 'Total Late Deduction',
            'Withholding Tax', 'SSS', 'SSS MPF', 'Philhealth', 'HDMF',
            'Employee Cash Advances (LESS)', 'HDMF Calamity Loan (LESS)', 'HDMF Salary Loan (LESS)', 'Motorcycle Loan (LESS)',
            'PHILHEALTH EMPLOYEE (LESS)', 'RFE Others (LESS)', 'SSS Calamity Loan (LESS)', 'SSS Salary Loan (LESS)',
            'Deductions Total', 'Net Pay', 'Tax YTD', 'Net YTD', 'Taxable Gross',
            'SSSER', 'SSS MPFER', 'SSSEC', 'PHER', 'HDMFER', 'HDMF Additional',
        ];
        $total = count($headers);
        // Text columns that are never summed in the subtotal/grand-total rows.
        $textCols = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 22, 24, 26];

        $valuesOf = function (Payslip $r) use ($comp, $prof, $bank, $ytd, $statutory, $hhmm): array {
            $e = $r->employee;
            $c = $comp->get($r->employee_id);
            $p = $prof->get($r->employee_id);
            $b = $bank->get($r->employee_id);
            $y = $ytd->get($r->employee_id);

            $basicMonthly = (float) ($c->basic_monthly ?? ($r->basic_pay * 2));
            $deMinMonthly = (float) ($p->de_minimis ?? ($r->de_minimis * 2));
            $workDays = (int) ($p->work_days_per_year ?? 313) ?: 313;
            $grossDay = round($basicMonthly * 12 / $workDays, 2);
            $er = $statutory->monthlyEmployerContributions($basicMonthly);

            // Loan amortizations broken out by type from the payslip breakdown.
            $ln = ['cash_advance' => 0.0, 'sss_salary' => 0.0, 'sss_calamity' => 0.0, 'pagibig_mpl' => 0.0, 'pagibig_calamity' => 0.0, 'other' => 0.0];
            foreach ((array) ($r->breakdown['loans'] ?? []) as $l) {
                $t = $l['type'] ?? 'other';
                $ln[$t] = ($ln[$t] ?? 0) + (float) ($l['amount'] ?? 0);
            }
            $rfeOther = ($ln['other'] ?? 0) + array_sum(array_diff_key($ln, array_flip(['cash_advance', 'sss_salary', 'sss_calamity', 'pagibig_mpl', 'pagibig_calamity', 'other'])));

            return [
                $e?->employee_no ?? '',
                trim(($e?->last_name ?? '').', '.trim(($e?->first_name ?? '').' '.($e?->middle_name ?? ''))),
                $e?->position?->title ?? '',
                $e?->department?->name ?: 'Unassigned',
                $e?->date_hired?->format('m/d/Y') ?? '',
                $e?->employmentType?->name ?: ($e?->is_active ? 'Active' : 'Resigned'),
                (string) ($b?->account_number ?? ''),
                (string) ($p->cost_center ?? ''),
                $e?->gender ?? '',
                $workDays,
                $basicMonthly,
                $deMinMonthly,
                round($basicMonthly + $deMinMonthly, 2),
                round($basicMonthly / 2, 2),
                $grossDay,
                round($grossDay / 8, 2),
                round($deMinMonthly / 2, 2),
                0.0,                              // BASIC ADJUSTMENT (not tracked)
                0.0,                              // Communication Allowance (not broken out)
                0.0,                              // Overtime Adjustment (not tracked)
                (float) $r->allowance,            // Representation ← system's lump allowance
                (float) $r->night_diff_pay,       // Ord-ND
                $hhmm((int) $r->night_diff_minutes),
                (float) $r->overtime_pay,         // Ord-OT
                $hhmm((int) $r->overtime_minutes),
                (float) $r->rest_day_pay,         // RD
                '00:00',                          // RD(hh:mm) (rest-day minutes not tracked)
                round((float) $r->night_diff_pay + (float) $r->overtime_pay + (float) $r->rest_day_pay, 2),
                (float) $r->gross_pay,            // Total Salary
                (float) $r->days_worked,          // Days Worked (0.5 for an official half-day)
                (float) $r->days_absent,
                (float) $r->absences_deduction,
                0.0,                              // Deminimis Deduction (not tracked)
                0.0,                              // Allowance Absent Deduction (not tracked)
                (float) $r->other_deductions,     // Discretionary Deduction
                (int) $r->late_minutes,
                (float) $r->tardiness_deduction,
                (float) $r->withholding_tax,
                (float) $r->sss,
                0.0,                              // SSS MPF (not split from SSS)
                (float) $r->philhealth,
                (float) $r->pagibig,              // HDMF
                round($ln['cash_advance'], 2),
                round($ln['pagibig_calamity'], 2),
                round($ln['pagibig_mpl'], 2),
                0.0,                              // Motorcycle Loan (no matching type)
                0.0,                              // PHILHEALTH EMPLOYEE (LESS)
                round($rfeOther, 2),              // RFE Others (company/other loans)
                round($ln['sss_calamity'], 2),
                round($ln['sss_salary'], 2),
                (float) $r->total_deductions,
                (float) $r->net_pay,
                (float) ($y->tax ?? $r->withholding_tax),
                (float) ($y->net ?? $r->net_pay),
                round((float) $r->gross_pay - (float) $r->de_minimis, 2),  // Taxable Gross (de-minimis exempt)
                round(($er['sss'] ?? 0) / 2, 2),  // SSSER (semi-monthly)
                0.0,                              // SSS MPFER
                0.0,                              // SSSEC
                round(($er['philhealth'] ?? 0) / 2, 2),  // PHER
                round(($er['pagibig'] ?? 0) / 2, 2),     // HDMFER
                0.0,                              // HDMF Additional
            ];
        };

        // Never mix confidential and non-confidential staff: group by pay group
        // FIRST, then by department (alphabetical), then employees by name.
        $byGroup = ['Non-confidential' => [], 'Confidential' => []];
        foreach ($rows as $r) {
            $g = $r->employee?->is_confidential ? 'Confidential' : 'Non-confidential';
            $byGroup[$g][$r->employee?->department?->name ?: 'Unassigned'][] = $r;
        }
        $byGroup = array_filter($byGroup, fn ($d) => ! empty($d));
        $splitGroups = count($byGroup) > 1; // only band by group when a run holds both

        $summedRow = function (string $label, array $sums) use ($total, $textCols): array {
            $row = array_fill(0, $total, '');
            $row[0] = $label;
            for ($c = 10; $c < $total; $c++) {
                if (! in_array($c, $textCols, true)) {
                    $row[$c] = round($sums[$c] ?? 0, 2);
                }
            }

            return $row;
        };

        $grand = array_fill(0, $total, 0.0);
        $data = [];
        foreach ($byGroup as $groupName => $depts) {
            ksort($depts);
            if ($splitGroups) {
                $data[] = array_merge(["══ {$groupName} employees ══"], array_fill(1, $total - 1, ''));
            }

            $groupSum = array_fill(0, $total, 0.0);
            foreach ($depts as $dept => $slips) {
                usort($slips, fn ($a, $b) => strcmp((string) $a->employee?->last_name, (string) $b->employee?->last_name));

                $data[] = array_merge(["Department: {$dept}"], array_fill(1, $total - 1, ''));

                $sub = array_fill(0, $total, 0.0);
                foreach ($slips as $r) {
                    $row = $valuesOf($r);
                    $data[] = $row;
                    for ($c = 10; $c < $total; $c++) {
                        if (! in_array($c, $textCols, true) && is_numeric($row[$c])) {
                            $sub[$c] += (float) $row[$c];
                            $groupSum[$c] += (float) $row[$c];
                            $grand[$c] += (float) $row[$c];
                        }
                    }
                }
                $data[] = $summedRow('Sub Total', $sub);
            }
            if ($splitGroups) {
                $data[] = $summedRow("{$groupName} Total", $groupSum);
            }
        }
        $data[] = $summedRow('GRAND TOTAL', $grand);

        $label = $run ? str_replace(' ', '_', $run->name) : $payrollRunId;
        $companyName = optional(\App\Domain\Identity\Models\Company::withoutGlobalScopes()->find($companyId))->trade_name
            ?? optional(\App\Domain\Identity\Models\Company::withoutGlobalScopes()->find($companyId))->legal_name
            ?? 'Company';

        return XlsxReport::download("payroll_{$label}.xlsx", $headers, $data, [
            'title' => 'Company Name: '.$companyName,
            'subtitle' => 'Payroll Period: Payroll for '.$run->period_start->format('n/j/Y').' - '.$run->period_end->format('n/j/Y'),
            'emphasize' => function (array $row) {
                $first = (string) ($row[0] ?? '');
                if (str_starts_with($first, 'Department:') || str_starts_with($first, '══')) {
                    return 'header';
                }

                return ($first === 'GRAND TOTAL' || str_ends_with($first, ' Total')) ? 'total' : null;
            },
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
