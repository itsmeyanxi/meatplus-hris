<?php

namespace App\Domain\HRIS\Services;

use App\Domain\HRIS\Models\Employee;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Bulk-imports leave applications from a CSV/XLSX (e.g. a LeaveReport export).
 * Employees are matched by Employee ID; leave types by name (within the company).
 * A row that matches an existing application (same employee + type + dates) is
 * skipped, so re-importing never duplicates.
 */
class LeaveApplicationImportService
{
    private const ALIASES = [
        'employee_no' => ['employeeid', 'employee id', 'employee no', 'emp id', 'id', 'empidno'],
        'leave_type' => ['leavetypename', 'leave type', 'leave type name', 'type'],
        'date_from' => ['datefrom', 'date from', 'from', 'start date', 'start'],
        'date_to' => ['dateto', 'date to', 'to', 'end date', 'end'],
        'with_pay_days' => ['withpaynoofdays', 'with pay', 'with pay days', 'paid days'],
        'without_pay_days' => ['woutpaynoofdays', 'without pay', 'without pay days', 'unpaid days'],
        'reason' => ['reason', 'remarks', 'purpose'],
        'status' => ['leavestatus', 'status'],
    ];

    /**
     * @return array{created:int, skipped:int, total:int, errors:array<int,array{row:int,message:string}>}
     */
    public function import(string $path, string $ext, int $companyId): array
    {
        $rows = $this->readRows($path, $ext);
        if (count($rows) < 2) {
            return ['created' => 0, 'skipped' => 0, 'total' => 0, 'errors' => [['row' => 0, 'message' => 'The file has no data rows.']]];
        }

        $map = $this->mapHeader(array_shift($rows));
        foreach (['employee_no', 'leave_type', 'date_from', 'date_to'] as $req) {
            if (! isset($map[$req])) {
                return ['created' => 0, 'skipped' => 0, 'total' => 0, 'errors' => [['row' => 1, 'message' => "Missing required column for: {$req}."]]];
            }
        }

        // Employees + leave types for this company.
        $emp = [];
        foreach (Employee::query()->where('company_id', $companyId)->get(['id', 'employee_no', 'biometric_user_id']) as $e) {
            if ($e->employee_no) $emp[strtolower(trim($e->employee_no))] = $e->id;
            if ($e->biometric_user_id) $emp[strtolower(trim($e->biometric_user_id))] = $e->id;
        }
        $types = DB::table('leave_types')->where('company_id', $companyId)->whereNull('deleted_at')->get(['id', 'name']);

        // Existing (employee|type|from|to) to skip duplicates.
        $exist = [];
        foreach (DB::table('leave_applications')->where('company_id', $companyId)->whereNull('deleted_at')->get(['employee_id', 'leave_type_id', 'date_from', 'date_to']) as $x) {
            $exist[$x->employee_id . '|' . $x->leave_type_id . '|' . $x->date_from . '|' . $x->date_to] = true;
        }

        $created = 0; $skipped = 0; $errors = []; $line = 1; $now = now();
        foreach ($rows as $cells) {
            $line++;
            if (! array_filter(array_map(fn ($c) => trim((string) $c), $cells))) continue;
            $get = fn (string $k) => isset($map[$k]) ? trim((string) ($cells[$map[$k]] ?? '')) : '';

            $empId = $emp[strtolower($get('employee_no'))] ?? null;
            if (! $empId) { $errors[] = ['row' => $line, 'message' => "No employee for ID \"{$get('employee_no')}\"."]; continue; }
            $typeId = $this->resolveType($types, $get('leave_type'));
            if (! $typeId) { $errors[] = ['row' => $line, 'message' => "Unknown leave type \"{$get('leave_type')}\"."]; continue; }
            try { $from = Carbon::parse($get('date_from'))->toDateString(); $to = Carbon::parse($get('date_to'))->toDateString(); }
            catch (\Throwable) { $errors[] = ['row' => $line, 'message' => 'Unreadable date(s).']; continue; }

            $key = $empId . '|' . $typeId . '|' . $from . '|' . $to;
            if (isset($exist[$key])) { $skipped++; continue; }
            $exist[$key] = true;

            $days = (float) ($get('with_pay_days') ?: 0) + (float) ($get('without_pay_days') ?: 0);
            DB::table('leave_applications')->insert([
                'company_id' => $companyId, 'employee_id' => $empId, 'leave_type_id' => $typeId,
                'date_from' => $from, 'date_to' => $to, 'days_count' => $days ?: 1, 'half_day' => false,
                'reason' => $get('reason') ?: null, 'status' => $this->mapStatus($get('status')),
                'decided_at' => $now, 'submitted_at' => $now, 'created_at' => $now, 'updated_at' => $now,
            ]);
            $created++;
        }

        return ['created' => $created, 'skipped' => $skipped, 'total' => count($rows), 'errors' => $errors];
    }

    private function resolveType($types, string $name): ?int
    {
        $n = strtolower(trim($name));
        if ($n === '') return null;
        foreach ($types as $t) {
            $dn = strtolower(trim($t->name));
            if ($dn === $n || str_starts_with($dn, $n) || str_starts_with($n, $dn) || str_contains($dn, $n)) return $t->id;
        }
        return null;
    }

    private function mapStatus(string $s): string
    {
        $s = strtolower(trim($s));
        if (str_starts_with($s, 'approved')) return 'approved';
        if (str_starts_with($s, 'rejected')) return 'rejected';
        if (str_starts_with($s, 'cancelled') || str_starts_with($s, 'canceled')) return 'cancelled';
        return 'pending';
    }

    /** @return array<int,array<int,string>> */
    private function readRows(string $path, string $ext): array
    {
        $reader = $ext === 'xlsx' ? new XlsxReader() : new CsvReader();
        $reader->open($path);
        $rows = [];
        foreach ($reader->getSheetIterator() as $sheet) {
            foreach ($sheet->getRowIterator() as $row) {
                $rows[] = array_map(fn ($c) => $c instanceof \DateTimeInterface ? $c->format('Y-m-d') : (is_scalar($c) ? (string) $c : ''), $row->toArray());
            }
            break;
        }
        $reader->close();
        return $rows;
    }

    private function mapHeader(array $header): array
    {
        $map = [];
        foreach ($header as $idx => $label) {
            $norm = strtolower(trim(preg_replace('/\s+/', ' ', (string) $label)));
            foreach (self::ALIASES as $canon => $list) {
                if (in_array($norm, $list, true)) { $map[$canon] = $idx; break; }
            }
        }
        return $map;
    }
}
