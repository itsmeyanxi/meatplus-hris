<?php

namespace App\Http\Controllers\Api\V1\Reports;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\OvertimeRequest;
use App\Domain\Leave\Models\LeaveApplication;
use App\Domain\Payroll\Models\Payslip;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ReportController extends Controller
{
    /** GET /api/v1/reports/dtr?date_from=&date_to=&employee_id=&department_id= */
    public function dtr(Request $request): Response
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
            ->orderBy('work_date')
            ->orderBy('employee_id')
            ->get();

        $lines = [];
        $lines[] = implode(',', [
            'Date', 'Employee No', 'Name', 'Department',
            'Time In', 'Time Out', 'Hours Worked',
            'Late (min)', 'Undertime (min)', 'OT (min)', 'Night Diff (min)',
            'Status',
        ]);

        foreach ($rows as $r) {
            $lines[] = implode(',', [
                $r->work_date->toDateString(),
                $r->employee?->employee_no ?? '',
                $this->csv(($r->employee?->last_name ?? '') . ', ' . ($r->employee?->first_name ?? '')),
                $this->csv($r->employee?->department?->name ?? ''),
                $r->actual_in?->format('H:i') ?? '',
                $r->actual_out?->format('H:i') ?? '',
                $r->hours_worked ?? '',
                $r->late_minutes ?? 0,
                $r->undertime_minutes ?? 0,
                $r->overtime_minutes ?? 0,
                $r->night_diff_minutes ?? 0,
                $r->dayStatus(),
            ]);
        }

        return $this->csvResponse(
            implode("\n", $lines),
            "dtr_{$request->date_from}_to_{$request->date_to}.csv"
        );
    }

    /** GET /api/v1/reports/leave?date_from=&date_to=&status= */
    public function leave(Request $request): Response
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
            ->when($request->date_from, fn ($q) => $q->where('start_date', '>=', $request->date_from))
            ->when($request->date_to,   fn ($q) => $q->where('end_date', '<=', $request->date_to))
            ->when($request->status,    fn ($q) => $q->where('status', $request->status))
            ->orderBy('start_date', 'desc')
            ->get();

        $lines = [];
        $lines[] = implode(',', [
            'Employee No', 'Name', 'Leave Type',
            'Start Date', 'End Date', 'Days', 'Status', 'Remarks',
        ]);

        foreach ($rows as $r) {
            $lines[] = implode(',', [
                $r->employee?->employee_no ?? '',
                $this->csv(($r->employee?->last_name ?? '') . ', ' . ($r->employee?->first_name ?? '')),
                $this->csv($r->leaveType?->name ?? ''),
                $r->start_date,
                $r->end_date,
                $r->total_days ?? '',
                $r->status,
                $this->csv($r->decision_remarks ?? ''),
            ]);
        }

        $suffix = $request->date_from ? "_{$request->date_from}_to_{$request->date_to}" : '';

        return $this->csvResponse(implode("\n", $lines), "leave_report{$suffix}.csv");
    }

    public function overtime(Request $request): Response
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

        $lines = [];
        $lines[] = implode(',', [
            'Employee No', 'Name', 'Date', 'Start', 'End',
            'Hours', 'Classification', 'Status', 'Reason',
        ]);

        foreach ($rows as $r) {
            $lines[] = implode(',', [
                $r->employee?->employee_no ?? '',
                $this->csv(($r->employee?->last_name ?? '') . ', ' . ($r->employee?->first_name ?? '')),
                $r->date?->toDateString() ?? '',
                $r->start_time,
                $r->end_time,
                $r->requested_hours ?? '',
                $this->csv($r->classification ?? ''),
                $r->status,
                $this->csv($r->reason ?? ''),
            ]);
        }

        $suffix = $request->date_from ? "_{$request->date_from}_to_{$request->date_to}" : '';

        return $this->csvResponse(implode("\n", $lines), "overtime_report{$suffix}.csv");
    }

    /** GET /api/v1/reports/payroll/{payrollRunId} */
    public function payroll(Request $request, int $payrollRunId): Response
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

        $lines = [];
        $lines[] = implode(',', [
            'Employee No', 'Name',
            'Days Worked', 'Days Absent', 'Late (min)', 'OT (min)',
            'Basic Pay', 'OT Pay', 'Night Diff', 'Allowance', 'Gross Pay',
            'SSS', 'PhilHealth', 'Pag-IBIG', 'W/Tax',
            'Absence Deduction', 'Tardiness Deduction', 'Total Deductions',
            'Net Pay',
        ]);

        foreach ($rows as $r) {
            $lines[] = implode(',', [
                $r->employee?->employee_no ?? '',
                $this->csv(($r->employee?->last_name ?? '') . ', ' . ($r->employee?->first_name ?? '')),
                $r->days_worked,
                $r->days_absent,
                $r->late_minutes,
                $r->overtime_minutes,
                $r->basic_pay,
                $r->overtime_pay,
                $r->night_diff_pay,
                $r->allowance,
                $r->gross_pay,
                $r->sss,
                $r->philhealth,
                $r->pagibig,
                $r->withholding_tax,
                $r->absences_deduction,
                $r->tardiness_deduction,
                $r->total_deductions,
                $r->net_pay,
            ]);
        }

        $label = $run ? str_replace(' ', '_', $run->name) : $payrollRunId;

        return $this->csvResponse(implode("\n", $lines), "payroll_{$label}.csv");
    }

    private function csv(string $value): string
    {
        if (str_contains($value, ',') || str_contains($value, '"') || str_contains($value, "\n")) {
            return '"' . str_replace('"', '""', $value) . '"';
        }
        return $value;
    }

    private function csvResponse(string $content, string $filename): Response
    {
        return response($content, 200, [
            'Content-Type'        => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ]);
    }
}
