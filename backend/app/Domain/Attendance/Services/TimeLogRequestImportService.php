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
        'employee_no' => ['employee id', 'employee no', 'employee number', 'emp id', 'id', 'employee_no', 'biometric id', 'biometricid', 'device pin', 'empidno', 'emp id no', 'id no'],
        'work_date' => ['date', 'work date', 'work_date', 'day', 'attendance date'],
        'time_in' => ['time in', 'time_in', 'in', 'clock in', 'am in', 'time-in'],
        'time_out' => ['time out', 'time_out', 'out', 'clock out', 'pm out', 'time-out'],
        // Event/punch-level format (one row per scan): a single timestamp + direction.
        'log_time' => ['logtime', 'log time', 'log_time', 'datetime', 'date time', 'punch time', 'timestamp', 'time stamp'],
        'direction' => ['inoutmode', 'in out mode', 'in/out', 'inout', 'direction', 'mode', 'log type', 'punch type'],
        // Person's name, used as a fallback when the ID/PIN isn't mapped to anyone.
        'full_name' => ['fullname', 'full name', 'name', 'employee name', 'employeename'],
    ];

    /** Per-company name → employee-id index, built lazily for name-fallback matching. */
    private array $nameIndex = [];

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

        // Event/punch-level sheet (BiometricID | LogTime | In/Out): one row per scan.
        // Aggregate to day level (first IN, last OUT) before creating requests.
        if (isset($map['log_time']) && ! isset($map['time_in']) && ! isset($map['time_out'])) {
            if (! isset($map['employee_no'])) {
                return ['batch_id' => $batchId, 'created' => 0, 'total' => 0,
                    'errors' => [['row' => 1, 'message' => 'Missing required column: Employee/Biometric ID.']]];
            }

            return $this->importEventRows($rows, $map, $companyId, $uploadedBy, $batchId);
        }

        foreach (['employee_no', 'work_date'] as $required) {
            if (! isset($map[$required])) {
                return ['batch_id' => $batchId, 'created' => 0, 'total' => 0,
                    'errors' => [['row' => 1, 'message' => "Missing required column for: {$required} (need Employee ID + Date + Time, or Biometric ID + LogTime + In/Out)."]]];
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
            $employeeId = $this->resolveEmployee($companyId, $empNo, $empCache, $get('full_name'));
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

    /**
     * Import a punch-level sheet (one row per scan) by grouping rows into one
     * day-level request per employee/date: earliest IN and latest OUT.
     *
     * @param  array<int,array<int,string>>  $rows
     * @param  array<string,int>  $map
     * @return array{batch_id:string, created:int, errors:array<int,array{row:int,message:string}>, total:int}
     */
    private function importEventRows(array $rows, array $map, int $companyId, ?int $uploadedBy, string $batchId): array
    {
        $empCache = [];
        $errors = [];
        $line = 1;
        $groups = []; // employeeId => date => ['in' => [times], 'out' => [times]]

        foreach ($rows as $cells) {
            $line++;
            if (! array_filter(array_map(fn ($c) => trim((string) $c), $cells))) {
                continue;
            }

            $get = fn (string $key) => isset($map[$key]) ? trim((string) ($cells[$map[$key]] ?? '')) : '';

            $empNo = $get('employee_no');
            $logRaw = $get('log_time');
            $dir = strtolower($get('direction'));

            if ($empNo === '') {
                $errors[] = ['row' => $line, 'message' => 'Missing Employee/Biometric ID.'];

                continue;
            }
            $employeeId = $this->resolveEmployee($companyId, $empNo, $empCache, $get('full_name'));
            if (! $employeeId) {
                $errors[] = ['row' => $line, 'message' => "No employee found for ID \"{$empNo}\" in this company."];

                continue;
            }
            try {
                $ts = Carbon::parse($logRaw);
            } catch (\Throwable) {
                $errors[] = ['row' => $line, 'message' => "Unreadable timestamp \"{$logRaw}\"."];

                continue;
            }

            // "out"/"break out" → out; anything else (in, break in, blank) → in.
            $isOut = str_starts_with($dir, 'out') || $dir === 'break out';
            $groups[$employeeId][$ts->toDateString()][$isOut ? 'out' : 'in'][] = $ts->format('H:i:s');
        }

        $created = 0;
        foreach ($groups as $employeeId => $dates) {
            foreach ($dates as $date => $io) {
                $timeIn = ! empty($io['in']) ? min($io['in']) : null;
                $timeOut = ! empty($io['out']) ? max($io['out']) : null;
                if (! $timeIn && ! $timeOut) {
                    continue;
                }

                TimeLogRequest::create([
                    'company_id' => $companyId,
                    'employee_id' => $employeeId,
                    'batch_id' => $batchId,
                    'work_date' => $date,
                    'time_in' => $timeIn,
                    'time_out' => $timeOut,
                    'status' => 'pending',
                    'uploaded_by' => $uploadedBy,
                ]);
                $created++;
            }
        }

        return ['batch_id' => $batchId, 'created' => $created, 'total' => count($rows), 'errors' => $errors];
    }

    /**
     * Resolve an employee within the company. Tries the device ID/PIN first
     * (employee_no or biometric_user_id); when that misses and the sheet carries
     * a name, falls back to matching that name. On a unique name match whose
     * employee has no biometric ID yet, the numeric PIN is *learned* onto that
     * employee so every future upload matches on the ID directly.
     */
    private function resolveEmployee(int $companyId, string $id, array &$cache, string $fullName = ''): ?int
    {
        $key = strtolower($id).'|'.strtolower(trim($fullName));
        if (array_key_exists($key, $cache)) {
            return $cache[$key];
        }

        $emp = null;
        if ($id !== '') {
            $emp = Employee::query()->where('company_id', $companyId)
                ->where(function ($q) use ($id) {
                    $q->where('employee_no', $id)->orWhere('biometric_user_id', $id);
                })
                ->first(['id', 'biometric_user_id']);
        }

        // Name fallback: only accept an unambiguous single match.
        if (! $emp && trim($fullName) !== '') {
            $wanted = $this->nameTokens($fullName);
            if ($wanted) {
                $hits = [];
                foreach ($this->companyNameIndex($companyId) as $cand) {
                    // All sheet-name tokens present in the employee's full name,
                    // or the employee's core (first+last) fully present in the sheet name.
                    if (! array_diff($wanted, $cand['full']) || ! array_diff($cand['core'], $wanted)) {
                        $hits[$cand['id']] = $cand;
                    }
                }
                if (count($hits) === 1) {
                    $emp = (object) reset($hits);
                    // Learn a numeric device PIN onto an employee that has none yet.
                    if ($id !== '' && preg_match('/^\d+$/', $id) && empty($emp->biometric_user_id)) {
                        Employee::query()->where('id', $emp->id)->update(['biometric_user_id' => $id]);
                    }
                }
            }
        }

        return $cache[$key] = $emp?->id;
    }

    /** Normalized, order-independent token set of a person's name. */
    private function nameTokens(string $s): array
    {
        $s = mb_strtoupper(trim(preg_replace('/[^\p{L}\s]/u', ' ', $s)));
        $t = array_values(array_unique(array_filter(preg_split('/\s+/u', $s))));
        sort($t);

        return $t;
    }

    /** @return array<int,array{id:int,biometric_user_id:?string,full:array<int,string>,core:array<int,string>}> */
    private function companyNameIndex(int $companyId): array
    {
        if (isset($this->nameIndex[$companyId])) {
            return $this->nameIndex[$companyId];
        }
        $list = [];
        foreach (Employee::query()->where('company_id', $companyId)
            ->get(['id', 'first_name', 'middle_name', 'last_name', 'biometric_user_id']) as $e) {
            $list[] = [
                'id' => $e->id,
                'biometric_user_id' => $e->biometric_user_id,
                'full' => $this->nameTokens("{$e->first_name} {$e->middle_name} {$e->last_name}"),
                'core' => $this->nameTokens("{$e->first_name} {$e->last_name}"),
            ];
        }

        return $this->nameIndex[$companyId] = $list;
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

        $cell = function ($c) {
            // Keep both date AND time so time-of-day cells aren't flattened away.
            if ($c instanceof \DateTimeInterface) {
                return $c->format('Y-m-d H:i:s');
            }
            if ($c instanceof \DateInterval) {
                return sprintf('%02d:%02d:%02d', $c->h, $c->i, $c->s);
            }

            return is_scalar($c) ? (string) $c : '';
        };

        // Read the sheet that actually HOLDS THE DATA, not blindly the first one.
        // Our own downloadable template puts a "How to fill" guide on sheet 1 and
        // the real "Time Logs" grid on sheet 2, so reading sheet 1 parsed the
        // instructions, found no recognizable header, and rejected the whole
        // upload with "Missing required column" — the system's own template could
        // not be imported by the system. The first sheet whose header row maps to
        // a usable column set wins; if none does, fall back to the first sheet so
        // the original error still surfaces for a genuinely malformed file.
        $first = null;
        $rows = [];
        foreach ($reader->getSheetIterator() as $sheet) {
            $sheetRows = [];
            foreach ($sheet->getRowIterator() as $row) {
                $sheetRows[] = array_map($cell, $row->toArray());
            }

            $first ??= $sheetRows;

            if (count($sheetRows) >= 2 && $this->looksLikeDataSheet($sheetRows[0])) {
                $rows = $sheetRows;
                break;
            }
        }
        $reader->close();

        return $rows ?: ($first ?? []);
    }

    /**
     * Whether a header row carries the columns an import needs: an employee
     * identifier plus either a date or a timestamp. Used to pick the data sheet
     * out of a multi-sheet workbook (guide tab + data tab).
     *
     * @param  array<int,string>  $header
     */
    private function looksLikeDataSheet(array $header): bool
    {
        $map = $this->mapHeader($header);

        return isset($map['employee_no'])
            && (isset($map['work_date']) || isset($map['log_time']));
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
