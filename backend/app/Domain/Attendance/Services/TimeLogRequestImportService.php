<?php

namespace App\Domain\Attendance\Services;

use App\Domain\Attendance\Models\TimeLogRequest;
use App\Domain\HRIS\Models\Employee;
use Carbon\Carbon;
use Illuminate\Support\Str;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Parses an admin-uploaded, day-level time-log sheet (Employee ID | Date |
 * Time In | Time Out) into PENDING TimeLogRequest rows under one batch. Nothing
 * touches attendance until an approver approves the rows.
 */
class TimeLogRequestImportService
{
    /** Canonical column => accepted header aliases (lower-cased, space-collapsed). */
    private const ALIASES = [
        'employee_no' => ['employee id', 'employee no', 'employee number', 'emp id', 'id', 'employee_no', 'biometric id', 'device pin'],
        'work_date' => ['date', 'work date', 'work_date', 'day', 'attendance date'],
        'time_in' => ['time in', 'time_in', 'in', 'clock in', 'am in', 'time-in'],
        'time_out' => ['time out', 'time_out', 'out', 'clock out', 'pm out', 'time-out'],
    ];

    /**
     * @return array{batch_id:string, created:int, errors:array<int,array{row:int,message:string}>, total:int}
     */
    public function import(string $path, string $ext, int $companyId, ?int $uploadedBy): array
    {
        $rows = $this->readRows($path, $ext);
        $batchId = (string) Str::uuid();
        if (count($rows) < 2) {
            return ['batch_id' => $batchId, 'created' => 0, 'total' => 0,
                'errors' => [['row' => 0, 'message' => 'The file has no data rows.']]];
        }

        $map = $this->mapHeader(array_shift($rows));
        foreach (['employee_no', 'work_date'] as $required) {
            if (! isset($map[$required])) {
                return ['batch_id' => $batchId, 'created' => 0, 'total' => 0,
                    'errors' => [['row' => 1, 'message' => "Missing required column for: {$required} (need at least Employee ID and Date)."]]];
            }
        }

        $created = 0;
        $errors = [];
        $empCache = []; // employee_no|bio (lower) => employee_id|null
        $line = 1;

        foreach ($rows as $cells) {
            $line++;
            if (! array_filter(array_map(fn ($c) => trim((string) $c), $cells))) {
                continue; // blank line
            }

            $get = fn (string $key) => isset($map[$key]) ? trim((string) ($cells[$map[$key]] ?? '')) : '';

            $empNo = $get('employee_no');
            $dateRaw = $get('work_date');
            $timeIn = $this->parseTime($get('time_in'));
            $timeOut = $this->parseTime($get('time_out'));

            if ($empNo === '') {
                $errors[] = ['row' => $line, 'message' => 'Missing Employee ID.'];

                continue;
            }
            $employeeId = $this->resolveEmployee($companyId, $empNo, $empCache);
            if (! $employeeId) {
                $errors[] = ['row' => $line, 'message' => "No employee found for ID \"{$empNo}\" in this company."];

                continue;
            }
            $workDate = $this->parseDate($dateRaw);
            if (! $workDate) {
                $errors[] = ['row' => $line, 'message' => "Unreadable date \"{$dateRaw}\" (use YYYY-MM-DD)."];

                continue;
            }
            if (! $timeIn && ! $timeOut) {
                $errors[] = ['row' => $line, 'message' => 'Row has neither a Time In nor a Time Out.'];

                continue;
            }

            TimeLogRequest::create([
                'company_id' => $companyId,
                'employee_id' => $employeeId,
                'batch_id' => $batchId,
                'work_date' => $workDate,
                'time_in' => $timeIn,
                'time_out' => $timeOut,
                'status' => 'pending',
                'uploaded_by' => $uploadedBy,
            ]);
            $created++;
        }

        return ['batch_id' => $batchId, 'created' => $created, 'total' => count($rows), 'errors' => $errors];
    }

    /** Resolve an employee by employee_no, then by biometric_user_id, within the company. */
    private function resolveEmployee(int $companyId, string $id, array &$cache): ?int
    {
        $key = strtolower($id);
        if (array_key_exists($key, $cache)) {
            return $cache[$key];
        }

        $emp = Employee::query()->where('company_id', $companyId)
            ->where(function ($q) use ($id) {
                $q->where('employee_no', $id)->orWhere('biometric_user_id', $id);
            })
            ->first(['id']);

        return $cache[$key] = $emp?->id;
    }

    /** @return array<int,array<int,string>> */
    private function readRows(string $path, string $ext): array
    {
        if ($ext === 'csv') {
            $raw = file_get_contents($path);
            $encoding = mb_detect_encoding($raw, ['UTF-8', 'Windows-1252', 'ISO-8859-1', 'UTF-16'], true);
            if ($encoding && $encoding !== 'UTF-8') {
                $tmp = tempnam(sys_get_temp_dir(), 'tlr_');
                file_put_contents($tmp, mb_convert_encoding($raw, 'UTF-8', $encoding));
                $path = $tmp;
            }
        }

        $reader = $ext === 'xlsx' ? new XlsxReader() : new CsvReader();
        $reader->open($path);

        $rows = [];
        foreach ($reader->getSheetIterator() as $sheet) {
            foreach ($sheet->getRowIterator() as $row) {
                $rows[] = array_map(function ($c) {
                    // Keep both date AND time so time-of-day cells aren't flattened away.
                    if ($c instanceof \DateTimeInterface) {
                        return $c->format('Y-m-d H:i:s');
                    }
                    if ($c instanceof \DateInterval) {
                        return sprintf('%02d:%02d:%02d', $c->h, $c->i, $c->s);
                    }

                    return is_scalar($c) ? (string) $c : '';
                }, $row->toArray());
            }
            break;
        }
        $reader->close();

        return $rows;
    }

    /** @return array<string,int> canonical key => column index */
    private function mapHeader(array $header): array
    {
        $map = [];
        foreach ($header as $idx => $label) {
            $norm = strtolower(trim(preg_replace('/\s+/', ' ', (string) $label)));
            foreach (self::ALIASES as $canon => $list) {
                if (in_array($norm, $list, true)) {
                    $map[$canon] = $idx;
                    break;
                }
            }
        }

        return $map;
    }

    private function parseDate(string $v): ?string
    {
        $v = trim($v);
        if ($v === '') {
            return null;
        }
        try {
            return Carbon::parse($v)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    /** Parse a time cell into H:i:s, or null when blank/unreadable. */
    private function parseTime(string $v): ?string
    {
        $v = trim($v);
        if ($v === '') {
            return null;
        }
        try {
            return Carbon::parse($v)->format('H:i:s');
        } catch (\Throwable) {
            return null;
        }
    }
}
