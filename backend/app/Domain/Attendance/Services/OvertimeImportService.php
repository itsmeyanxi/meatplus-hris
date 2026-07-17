<?php

namespace App\Domain\Attendance\Services;

use App\Domain\HRIS\Models\Employee;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Bulk-imports approved overtime from a CSV/XLSX (e.g. an OvertimeReport export).
 * One row per employee per day; the "Approved OT Schedule" gives start/end and
 * "OT Approved Minutes" the hours. Rows with no approved minutes are ignored,
 * and a row matching an existing OT record (employee + date + start) is skipped.
 */
class OvertimeImportService
{
    private const ALIASES = [
        'employee_no' => ['empidno', 'employee id', 'employee no', 'emp id no', 'emp id', 'id'],
        'date' => ['shift date', 'date', 'ot date'],
        'schedule' => ['approved ot schedule', 'ot schedule', 'schedule'],
        'minutes' => ['ot approved minutes', 'approved minutes', 'minutes'],
        'type' => ['type', 'ot type'],
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
        foreach (['employee_no', 'date', 'minutes'] as $req) {
            if (! isset($map[$req])) {
                return ['created' => 0, 'skipped' => 0, 'total' => 0, 'errors' => [['row' => 1, 'message' => "Missing required column for: {$req}."]]];
            }
        }

        $emp = [];
        foreach (Employee::query()->where('company_id', $companyId)->get(['id', 'employee_no', 'biometric_user_id']) as $e) {
            if ($e->employee_no) $emp[strtolower(trim($e->employee_no))] = $e->id;
            if ($e->biometric_user_id) $emp[strtolower(trim($e->biometric_user_id))] = $e->id;
        }

        $exist = [];
        foreach (DB::table('overtime_requests')->where('company_id', $companyId)->get(['employee_id', 'date', 'start_time']) as $x) {
            $exist[$x->employee_id . '|' . $x->date . '|' . (string) $x->start_time] = true;
        }

        $created = 0; $skipped = 0; $errors = []; $line = 1; $now = now(); $batch = [];
        foreach ($rows as $cells) {
            $line++;
            if (! array_filter(array_map(fn ($c) => trim((string) $c), $cells))) continue;
            $get = fn (string $k) => isset($map[$k]) ? trim((string) ($cells[$map[$k]] ?? '')) : '';

            $mins = (int) round((float) preg_replace('/[^0-9.]/', '', $get('minutes')));
            if ($mins <= 0) { $skipped++; continue; }
            $empId = $emp[strtolower($get('employee_no'))] ?? null;
            if (! $empId) { $errors[] = ['row' => $line, 'message' => "No employee for ID \"{$get('employee_no')}\"."]; continue; }
            try { $date = Carbon::parse($get('date'))->toDateString(); }
            catch (\Throwable) { $errors[] = ['row' => $line, 'message' => "Unreadable date \"{$get('date')}\"."]; continue; }

            [$stRaw, $etRaw] = array_pad(array_map('trim', explode('-', $get('schedule'))), 2, '');
            $start = $this->time($stRaw); $end = $this->time($etRaw);
            $key = $empId . '|' . $date . '|' . ($start ?? '');
            if (isset($exist[$key])) { $skipped++; continue; }
            $exist[$key] = true;

            $batch[] = [
                'company_id' => $companyId, 'employee_id' => $empId, 'date' => $date,
                'start_time' => $start, 'end_time' => $end, 'requested_hours' => round($mins / 60, 2),
                'reason' => 'Imported overtime', 'classification' => stripos($get('type'), 'early') !== false ? 'early' : 'normal',
                'status' => 'approved', 'decided_at' => $now, 'decision_remarks' => 'Bulk-imported (approved in source)',
                'created_at' => $now, 'updated_at' => $now,
            ];
            $created++;
            if (count($batch) >= 500) { DB::table('overtime_requests')->insert($batch); $batch = []; }
        }
        if ($batch) DB::table('overtime_requests')->insert($batch);

        return ['created' => $created, 'skipped' => $skipped, 'total' => count($rows), 'errors' => $errors];
    }

    private function time(string $v): ?string
    {
        $v = trim($v);
        if ($v === '') return null;
        try { return Carbon::parse($v)->format('H:i:s'); } catch (\Throwable) { return null; }
    }

    /** @return array<int,array<int,string>> */
    private function readRows(string $path, string $ext): array
    {
        $reader = $ext === 'xlsx' ? new XlsxReader() : new CsvReader();
        $reader->open($path);
        $rows = [];
        foreach ($reader->getSheetIterator() as $sheet) {
            foreach ($sheet->getRowIterator() as $row) {
                $rows[] = array_map(fn ($c) => $c instanceof \DateTimeInterface ? $c->format('Y-m-d H:i:s') : (is_scalar($c) ? (string) $c : ''), $row->toArray());
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
