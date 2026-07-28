<?php

namespace App\Http\Controllers\Api\V1\Reports;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\OvertimeRequest;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Models\Company;
use App\Domain\Leave\Models\LeaveApplication;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\Payslip;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

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
            ->when($request->date_from, fn ($q) => $q->where('date_from', '>=', $request->date_from))
            ->when($request->date_to,   fn ($q) => $q->where('date_to', '<=', $request->date_to))
            ->when($request->status,    fn ($q) => $q->where('status', $request->status))
            ->orderBy('date_from', 'desc')
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
                $r->date_from?->toDateString() ?? '',
                $r->date_to?->toDateString() ?? '',
                $r->days_count ?? '',
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
            'Basic Pay', 'OT Pay', 'Night Diff', 'Holiday Pay', 'Rest Day Pay', 'Allowance', 'De Minimis', 'Gross Pay',
            'SSS', 'PhilHealth', 'Pag-IBIG', 'W/Tax',
            'Absence Deduction', 'Tardiness Deduction', 'Loans', 'Total Deductions',
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
                $r->holiday_pay,
                $r->rest_day_pay,
                $r->allowance,
                $r->de_minimis,
                $r->gross_pay,
                $r->sss,
                $r->philhealth,
                $r->pagibig,
                $r->withholding_tax,
                $r->absences_deduction,
                $r->tardiness_deduction,
                $r->loans_deduction,
                $r->total_deductions,
                $r->net_pay,
            ]);
        }

        $label = $run ? str_replace(' ', '_', $run->name) : $payrollRunId;

        return $this->csvResponse(implode("\n", $lines), "payroll_{$label}.csv");
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
