<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\OvertimeRequest;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Models\Company;
use App\Domain\Leave\Models\LeaveApplication;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\Payslip;
use Illuminate\Console\Command;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;

/**
 * Human-readable data archive: dumps EVERY company's data into one XLSX file per
 * category, foldered by company, bundled into a single dated ZIP under
 * storage/../backups/archives. Complements the daily pg_dump (which is the real
 * restore path) with a portable, auditable snapshot. Meant to run every ~15 days.
 */
class ArchiveAllCompanies extends Command
{
    protected $signature = 'archive:all-companies {--keep=6 : How many dated archives to retain}';

    protected $description = 'Export all companies\' data into one zipped set of Excel files (portable archive).';

    public function handle(): int
    {
        // Repo-root /backups/archives — alongside the daily pg_dump backups.
        $outDir = dirname(base_path()).'/backups/archives';
        if (! is_dir($outDir)) {
            mkdir($outDir, 0775, true);
        }

        $stamp = now()->format('Ymd_His');
        $tmp = [];   // archive path (Company/File.xlsx) => temp file path

        $companies = Company::query()->orderBy('id')->get();
        $this->info("Archiving {$companies->count()} companies…");

        foreach ($companies as $company) {
            $code = $company->code ?: ('company'.$company->id);
            $this->line("  • {$code}");
            foreach ($this->categories($company->id) as $name => [$headers, $rows, $map]) {
                $path = tempnam(sys_get_temp_dir(), 'arc');
                $writer = new XlsxWriter();
                $writer->openToFile($path);
                $writer->addRow(Row::fromValues($headers));
                foreach ($rows as $item) {
                    $writer->addRow(Row::fromValues(array_map(static fn ($v) => $v ?? '', $map($item))));
                }
                $writer->close();
                $tmp["{$code}/{$name}"] = $path;
            }
        }

        $zipPath = "{$outDir}/all-companies-{$stamp}.zip";
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);
        foreach ($tmp as $archiveName => $path) {
            $zip->addFile($path, $archiveName);
        }
        $zip->close();
        foreach ($tmp as $path) {
            @unlink($path);
        }

        $size = round(filesize($zipPath) / 1024, 1);
        $this->info("Wrote {$zipPath} ({$size} KB)");

        $this->prune($outDir, (int) $this->option('keep'));

        return self::SUCCESS;
    }

    /**
     * Category definitions for one company. withoutGlobalScopes + explicit
     * company_id so this works from the console (no authenticated user) and
     * always targets exactly the requested company.
     *
     * @return array<string, array{0: array<string>, 1: iterable, 2: callable}>
     */
    private function categories(int $companyId): array
    {
        $name = static fn ($e) => trim(($e?->last_name ?? '').', '.($e?->first_name ?? ''));

        return [
            '01_Employees.xlsx' => [
                ['Employee No', 'Last Name', 'First Name', 'Middle Name', 'Suffix', 'Gender', 'Civil Status', 'Birth Date', 'Department', 'Position', 'Location', 'Employment Type', 'Date Hired', 'Date Separated', 'Active', 'Company Email', 'Biometric ID', 'Confidential'],
                Employee::withoutGlobalScopes()->where('company_id', $companyId)->with('department:id,name', 'position:id,title', 'branch:id,name', 'employmentType:id,name')->orderBy('last_name')->orderBy('first_name')->lazy(500),
                static fn ($e) => [
                    $e->employee_no, $e->last_name, $e->first_name, $e->middle_name, $e->suffix,
                    $e->gender, $e->civil_status, $e->birth_date?->toDateString(),
                    $e->department?->name, $e->position?->title, $e->branch?->name, $e->employmentType?->name,
                    $e->date_hired?->toDateString(), $e->date_separated?->toDateString(),
                    $e->is_active ? 'Active' : 'Inactive', $e->email_company, $e->biometric_user_id,
                    $e->is_confidential ? 'Yes' : 'No',
                ],
            ],
            '02_Compensation.xlsx' => [
                ['Employee No', 'Name', 'Pay Type', 'Basic Monthly', 'Daily Rate', 'Monthly Allowance', 'Effective From', 'Active'],
                EmployeeCompensation::withoutGlobalScopes()->where('company_id', $companyId)->where('is_active', true)->with('employee:id,employee_no,first_name,last_name')->lazy(500),
                static fn ($c) => [
                    $c->employee?->employee_no, $name($c->employee), $c->pay_type,
                    $c->basic_monthly, $c->daily_rate, $c->allowance_monthly,
                    $c->effective_from?->toDateString(), $c->is_active ? 'Yes' : 'No',
                ],
            ],
            '03_TimeLogs.xlsx' => [
                ['Logged At', 'Employee No', 'Name', 'Direction', 'Source', 'Device', 'Location'],
                TimeLog::withoutGlobalScopes()->where('company_id', $companyId)->with('employee:id,employee_no,first_name,last_name,branch_id', 'employee.branch:id,name', 'device:id,serial_no,name')->orderByDesc('logged_at')->lazy(1000),
                static fn ($l) => [
                    $l->logged_at?->format('Y-m-d h:i:s A'), $l->employee?->employee_no, $name($l->employee),
                    $l->direction, $l->source, $l->device?->name ?? $l->device_id, $l->employee?->branch?->name,
                ],
            ],
            '04_DailyTimeRecords.xlsx' => [
                ['Date', 'Employee No', 'Name', 'Time In', 'Time Out', 'Hours Worked', 'Late (min)', 'Undertime (min)', 'OT (min)', 'Night Diff (min)', 'Status'],
                DailyTimeRecord::withoutGlobalScopes()->where('company_id', $companyId)->with('employee:id,employee_no,first_name,last_name')->orderByDesc('work_date')->lazy(1000),
                static fn ($r) => [
                    $r->work_date?->toDateString(), $r->employee?->employee_no, $name($r->employee),
                    $r->actual_in?->format('H:i'), $r->actual_out?->format('H:i'), $r->hours_worked,
                    $r->late_minutes, $r->undertime_minutes, $r->overtime_minutes, $r->night_diff_minutes,
                    method_exists($r, 'dayStatus') ? $r->dayStatus() : ($r->status ?? ''),
                ],
            ],
            '05_Leave.xlsx' => [
                ['Employee No', 'Name', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status', 'Remarks'],
                LeaveApplication::withoutGlobalScopes()->where('company_id', $companyId)->with('employee:id,employee_no,first_name,last_name', 'leaveType:id,name')->orderByDesc('date_from')->lazy(500),
                static fn ($r) => [
                    $r->employee?->employee_no, $name($r->employee), $r->leaveType?->name,
                    $r->date_from?->toDateString(), $r->date_to?->toDateString(),
                    $r->days_count, $r->status, $r->decision_remarks,
                ],
            ],
            '06_Overtime.xlsx' => [
                ['Employee No', 'Name', 'Date', 'Start', 'End', 'Hours', 'Classification', 'Status', 'Reason'],
                OvertimeRequest::withoutGlobalScopes()->where('company_id', $companyId)->with('employee:id,employee_no,first_name,last_name')->orderByDesc('date')->lazy(500),
                static fn ($r) => [
                    $r->employee?->employee_no, $name($r->employee), $r->date?->toDateString(),
                    $r->start_time, $r->end_time, $r->requested_hours, $r->classification, $r->status, $r->reason,
                ],
            ],
            '07_Payslips.xlsx' => [
                ['Payroll Run', 'Employee No', 'Name', 'Days Worked', 'Days Absent', 'Late (min)', 'OT (min)', 'Basic Pay', 'OT Pay', 'Night Diff', 'Allowance', 'Gross Pay', 'SSS', 'PhilHealth', 'Pag-IBIG', 'W/Tax', 'Total Deductions', 'Net Pay'],
                Payslip::withoutGlobalScopes()->where('company_id', $companyId)->with('employee:id,employee_no,first_name,last_name', 'run:id,name')->orderByDesc('id')->lazy(500),
                static fn ($p) => [
                    $p->run?->name, $p->employee?->employee_no, $name($p->employee),
                    $p->days_worked, $p->days_absent, $p->late_minutes, $p->overtime_minutes,
                    $p->basic_pay, $p->overtime_pay, $p->night_diff_pay, $p->allowance, $p->gross_pay,
                    $p->sss, $p->philhealth, $p->pagibig, $p->withholding_tax, $p->total_deductions, $p->net_pay,
                ],
            ],
            '08_Devices.xlsx' => [
                ['Name', 'Serial', 'Location', 'Active', 'Last Event', 'Last Synced'],
                AttendanceDevice::withoutGlobalScopes()->where('company_id', $companyId)->with('branch:id,name')->orderBy('name')->lazy(200),
                static fn ($d) => [
                    $d->name, $d->serial_no, $d->branch?->name, $d->is_active ? 'Yes' : 'No',
                    $d->last_event_at?->toDateTimeString(), $d->last_synced_at?->toDateTimeString(),
                ],
            ],
        ];
    }

    /** Keep only the newest $keep archives. */
    private function prune(string $dir, int $keep): void
    {
        $files = glob("{$dir}/all-companies-*.zip") ?: [];
        usort($files, static fn ($a, $b) => filemtime($b) <=> filemtime($a));
        foreach (array_slice($files, max(1, $keep)) as $old) {
            @unlink($old);
        }
    }
}
