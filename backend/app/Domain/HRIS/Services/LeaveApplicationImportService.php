<?php

namespace App\Domain\HRIS\Services;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Leave\Models\LeaveBalance;
use App\Domain\Leave\Models\LeaveType;
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
        'date_filed' => ['datefiled', 'date filed', 'filing date', 'filed date', 'date applied'],
        'approved_at' => ['dateapprovedsupervisor', 'date approved', 'approved date', 'date approved supervisor', 'date approved by supervisor'],
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
        $types = DB::table('leave_types')->where('company_id', $companyId)->whereNull('deleted_at')->get(['id', 'name'])->all();

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
            $typeId = $this->resolveType($types, $get('leave_type'), $companyId);
            if (! $typeId) { $errors[] = ['row' => $line, 'message' => 'Missing leave type.']; continue; }
            try { $from = Carbon::parse($get('date_from'))->toDateString(); $to = Carbon::parse($get('date_to'))->toDateString(); }
            catch (\Throwable) { $errors[] = ['row' => $line, 'message' => 'Unreadable date(s).']; continue; }

            $key = $empId . '|' . $typeId . '|' . $from . '|' . $to;
            if (isset($exist[$key])) { $skipped++; continue; }
            $exist[$key] = true;

            $withPay = (float) ($get('with_pay_days') ?: 0);
            $withoutPay = (float) ($get('without_pay_days') ?: 0);
            $days = ($withPay + $withoutPay) ?: 1; // total leave duration for the record
            $status = $this->mapStatus($get('status'));
            $filed = $this->parseFlexibleDate($get('date_filed')) ?? $now;
            $approved = $this->parseFlexibleDate($get('approved_at')) ?? $now;
            DB::table('leave_applications')->insert([
                'company_id' => $companyId, 'employee_id' => $empId, 'leave_type_id' => $typeId,
                'date_from' => $from, 'date_to' => $to, 'days_count' => $days,
                'with_pay_days' => isset($map['with_pay_days']) ? $withPay : null,
                'without_pay_days' => isset($map['without_pay_days']) ? $withoutPay : null,
                'half_day' => false,
                'reason' => $get('reason') ?: null, 'status' => $status,
                'decided_at' => $approved, 'submitted_at' => $filed, 'created_at' => $now, 'updated_at' => $now,
            ]);
            $created++;

            // Draw credits down by the PAID days only — with-pay days consume the
            // leave balance; without-pay days are beyond the balance and must not
            // reduce it. When the file has no with/without split, fall back to the
            // total. Only approved leaves on credit-tracked, paid types are drawn.
            if ($status === 'approved') {
                $consume = isset($map['with_pay_days']) ? $withPay : $days;
                $this->drawDownBalance($empId, $typeId, $from, $consume);
            }
        }

        return ['created' => $created, 'skipped' => $skipped, 'total' => count($rows), 'errors' => $errors];
    }

    /**
     * Resolve a leave type by name within the company; when the company hasn't
     * set that type up yet, create it on the fly (paid/unpaid inferred from the
     * name) so a historical leave report never dead-ends on a missing type. The
     * new type is appended to $types so later rows reuse it.
     *
     * @param  array<int,object>  $types
     */
    private function resolveType(array &$types, string $name, int $companyId): ?int
    {
        $n = $this->normType($name);
        if ($n === '') return null;
        foreach ($types as $t) {
            $dn = $this->normType($t->name);
            if ($dn === $n || str_starts_with($dn, $n) || str_starts_with($n, $dn) || str_contains($dn, $n)) return $t->id;
        }

        // Auto-create: unpaid unless the name clearly says so.
        $isPaid = ! (str_contains($n, 'without pay') || str_contains($n, 'unpaid') || str_contains($n, 'lwop') || str_contains($n, 'no pay'));
        $now = now();
        $id = DB::table('leave_types')->insertGetId([
            'company_id' => $companyId,
            'code' => $this->uniqueTypeCode($name, $companyId),
            'name' => trim($name),
            'default_credits_per_year' => 0,
            'is_paid' => $isPaid,
            'is_convertible_to_cash' => false,
            'requires_attachment' => false,
            'min_days_filing_lead' => 0,
            'accrual_method' => 'none',
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $types[] = (object) ['id' => $id, 'name' => trim($name)];

        return $id;
    }

    /** @var array<int,LeaveType|null> memoized leave-type models for balance draw-down */
    private array $typeModels = [];

    /**
     * Consume `days` from the employee's leave-credit balance for the year of the
     * leave (mirrors LeaveBalanceService: initialize opening balance from the type's
     * yearly grant on first touch, and only draw down credit-tracked, paid types —
     * unpaid/uncredited statutory leaves are never blocked by a balance).
     */
    private function drawDownBalance(int $empId, int $typeId, string $dateFrom, float $days): void
    {
        if ($days <= 0) {
            return;
        }
        $type = $this->typeModels[$typeId] ??= LeaveType::find($typeId);
        if (! $type || ! $type->is_paid) {
            return;
        }
        $year = (int) substr($dateFrom, 0, 4);
        $bal = LeaveBalance::firstOrCreate(
            ['employee_id' => $empId, 'leave_type_id' => $typeId, 'year' => $year],
            ['opening_balance' => $type->default_credits_per_year, 'used' => 0],
        );
        $tracked = (float) $type->default_credits_per_year > 0
            || (float) $bal->opening_balance > 0
            || (float) $bal->granted_adhoc > 0
            || (float) $bal->accrued > 0;
        if ($tracked) {
            $bal->increment('used', $days);
        }
    }

    /** Normalize a leave-type label for matching ("w/o" => "without", collapse spaces). */
    private function normType(string $s): string
    {
        $s = strtolower(trim($s));
        $s = str_replace(['w/o', 'w / o'], 'without', $s);

        return preg_replace('/\s+/', ' ', $s);
    }

    /** A unique, ≤20-char code for a company's new leave type. */
    private function uniqueTypeCode(string $name, int $companyId): string
    {
        $base = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $name));
        $base = $base !== '' ? substr($base, 0, 12) : 'LEAVE';
        $code = $base;
        $i = 1;
        while (DB::table('leave_types')->where('company_id', $companyId)->where('code', $code)->exists()) {
            $code = substr($base, 0, 10).$i++;
        }

        return $code;
    }

    /** Parse a date cell that may be m-d-Y (Sprout approved dates), Y-m-d, or slashed. */
    private function parseFlexibleDate(string $v): ?string
    {
        $v = trim($v);
        if ($v === '') {
            return null;
        }
        foreach (['m-d-Y', 'Y-m-d', 'm/d/Y', 'd/m/Y', 'Y/m/d'] as $fmt) {
            $d = \DateTime::createFromFormat('!'.$fmt, $v);
            if ($d && $d->format($fmt) === $v) {
                return $d->format('Y-m-d');
            }
        }
        try {
            return Carbon::parse($v)->toDateString();
        } catch (\Throwable) {
            return null;
        }
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
