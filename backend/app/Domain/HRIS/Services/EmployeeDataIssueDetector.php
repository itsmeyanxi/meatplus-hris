<?php

namespace App\Domain\HRIS\Services;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeDataIssue;
use App\Domain\Identity\Support\HrRecipients;
use App\Notifications\EmployeeDataIssuesDigest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Scans active employees for data problems HR should fix and keeps the
 * {@see EmployeeDataIssue} list in sync (opens new ones, resolves fixed ones). When
 * new issues appear, HR (holders of employee.update) get ONE aggregated digest on
 * the notification bell — never one-per-employee spam.
 *
 * Complements {@see \App\Domain\Attendance\Services\Biometric\BiometricAnomalyDetector}
 * (that one owns PIN-reuse collisions).
 */
class EmployeeDataIssueDetector
{
    /** No punches in this many days (for a scheduled, settled employee) => silent. */
    private const SILENT_DAYS = 14;

    /**
     * @return array<int, array{company_id:?int, employee_id:int, employee_name:string, category:string, severity:string, detail:string}>
     */
    public function detect(): array
    {
        $issues = [];

        $base = fn () => Employee::withoutGlobalScopes()->where('is_active', true);

        $checks = [
            ['missing_employment_type', 'high',   fn ($q) => $q->whereNull('employment_type_id'),
                'No employment type set — payroll cannot classify this employee.'],
            ['missing_position', 'medium', fn ($q) => $q->whereNull('position_id'),
                'No position assigned.'],
            ['missing_department', 'medium', fn ($q) => $q->whereNull('department_id'),
                'No department assigned.'],
            ['missing_biometric_id', 'medium', fn ($q) => $q->where(fn ($w) => $w->whereNull('biometric_user_id')->orWhere('biometric_user_id', '')),
                'No biometric ID — attendance will not be captured from the terminal.'],
        ];

        foreach ($checks as [$category, $severity, $filter, $detail]) {
            foreach ($filter($base())->get(['id', 'company_id', 'first_name', 'last_name']) as $e) {
                $issues[] = $this->issue($e, $category, $severity, $detail);
            }
        }

        // Missing compensation (can't be paid).
        $withComp = DB::table('employee_compensations')->distinct()->pluck('employee_id');
        foreach ($base()->whereNotIn('id', $withComp)->get(['id', 'company_id', 'first_name', 'last_name']) as $e) {
            $issues[] = $this->issue($e, 'missing_compensation', 'high', 'No compensation record — this employee cannot be paid.');
        }

        // Silent attendance: settled (hired >14d ago), has a schedule, but no punches
        // for 14+ days — the classic broken-enrolment / unrecorded-absence signal.
        $scheduled = DB::table('employee_schedules')->distinct()->pluck('employee_id');
        $recentPunchers = DB::table('time_logs')
            ->where('logged_at', '>=', now()->subDays(self::SILENT_DAYS)->toDateTimeString())
            ->distinct()->pluck('employee_id');
        $silent = $base()
            ->whereIn('id', $scheduled)
            ->whereNotIn('id', $recentPunchers)
            ->whereNotNull('date_hired')
            ->where('date_hired', '<=', now()->subDays(self::SILENT_DAYS)->toDateString())
            ->get(['id', 'company_id', 'first_name', 'last_name']);
        foreach ($silent as $e) {
            $issues[] = $this->issue($e, 'attendance_silent', 'high',
                'Active with a schedule but no punches in '.self::SILENT_DAYS.'+ days — check biometric enrolment or employment status.');
        }

        return $issues;
    }

    /**
     * Sync detected issues into the table, and OPTIONALLY digest-notify HR.
     *
     * Detection and announcement were deliberately split. Detection wants to run often
     * so the review page is current; announcing that often meant a fresh bell item at
     * any hour of the day, which is how 51 of these accumulated at 18% read. The
     * scheduler now detects hourly and notifies once each morning.
     *
     * Nothing is lost in between: a newly-opened issue is remembered by its null
     * `first_notified_at`, so the daily pass reports everything that appeared since
     * the last one rather than only what this exact run happened to find.
     *
     * @param  bool  $notify  send the digest (daily pass) or stay silent (hourly pass)
     * @return array{new:int, ongoing:int, resolved:int, open:int, notified:int}
     */
    public function sync(bool $notify = false): array
    {
        $current = $this->detect();
        $seen = [];
        $new = 0;
        $ongoing = 0;

        foreach ($current as $a) {
            $key = $a['employee_id'].'|'.$a['category'];
            $seen[$key] = true;

            $row = EmployeeDataIssue::firstOrNew([
                'employee_id' => $a['employee_id'],
                'category' => $a['category'],
            ]);

            if ($row->exists && $row->ignored) {
                continue; // HR chose to ignore this gap — don't reopen or count it
            }

            $isNew = ! $row->exists || $row->resolved_at !== null;
            $row->fill([
                'company_id' => $a['company_id'],
                'severity' => $a['severity'],
                'detail' => $a['detail'],
                'resolved_at' => null,
            ]);

            // Only stamp detected_at when the issue first appears (or returns after
            // being resolved). Refreshing it on every scan reset the clock, so a gap
            // open for weeks kept presenting itself as found just now — and "how long
            // has this been outstanding" became unanswerable.
            if ($isNew || $row->detected_at === null) {
                $row->detected_at = now();
            }
            $row->save();

            $isNew ? $new++ : $ongoing++;
        }

        // Auto-resolve issues that are no longer detected (and weren't ignored).
        $resolved = 0;
        EmployeeDataIssue::whereNull('resolved_at')->where('ignored', false)
            ->get(['id', 'employee_id', 'category'])
            ->each(function ($row) use ($seen, &$resolved) {
                if (! isset($seen[$row->employee_id.'|'.$row->category])) {
                    $row->forceFill(['resolved_at' => now()])->save();
                    $resolved++;
                }
            });

        $open = EmployeeDataIssue::whereNull('resolved_at')->where('ignored', false)->count();

        $notified = $notify ? $this->notifyPending() : 0;

        return ['new' => $new, 'ongoing' => $ongoing, 'resolved' => $resolved, 'open' => $open, 'notified' => $notified];
    }

    /**
     * Digest every company that has open issues HR has not been told about yet.
     *
     * Driven by `first_notified_at` rather than by what this run happened to detect,
     * so an issue found by an hourly pass at 2pm is still reported in the next
     * morning's digest instead of being silently skipped.
     *
     * @return int  companies notified
     */
    private function notifyPending(): int
    {
        $pending = EmployeeDataIssue::query()
            ->whereNull('resolved_at')
            ->where('ignored', false)
            ->whereNull('first_notified_at')
            ->selectRaw('company_id, count(*) as c')
            ->groupBy('company_id')
            ->pluck('c', 'company_id');

        $sent = 0;
        foreach ($pending as $companyId => $newCount) {
            $this->notifyHr($companyId ? (int) $companyId : null, (int) $newCount);
            $sent++;
        }

        return $sent;
    }

    /** Short human label per category, ordered high-severity first (drives the digest breakdown). */
    private const CATEGORY_LABELS = [
        'missing_employment_type' => 'no employment type',
        'missing_compensation' => 'no compensation',
        'attendance_silent' => 'silent attendance',
        'missing_position' => 'no position',
        'missing_department' => 'no department',
        'missing_biometric_id' => 'no biometric ID',
    ];

    /** Aggregated digest to the HR of ONE company (employee.update holders for it). */
    private function notifyHr(?int $companyId, int $newCount): void
    {
        try {
            $scope = fn ($q) => $q->whereNull('resolved_at')->where('ignored', false)
                ->when($companyId, fn ($c) => $c->where('company_id', $companyId));

            $openTotal = $scope(EmployeeDataIssue::query())->count();
            $highOpen = $scope(EmployeeDataIssue::query())->where('severity', 'high')->count();

            // Per-category counts so the digest can say exactly WHAT is missing.
            $counts = $scope(EmployeeDataIssue::query())
                ->select('category', DB::raw('count(*) as c'))
                ->groupBy('category')->pluck('c', 'category');
            $breakdown = [];
            foreach (self::CATEGORY_LABELS as $cat => $label) {
                if (($n = (int) ($counts[$cat] ?? 0)) > 0) {
                    $breakdown[] = ['label' => $label, 'count' => $n];
                }
            }

            $users = HrRecipients::withPermissionForCompany('employee.update', $companyId);
            if ($users->isEmpty()) {
                return;
            }

            // Carry the company so a cross-company HR is switched to it on click.
            $url = '/employees/data-issues'.($companyId ? '?company='.$companyId : '');

            Notification::send($users, new EmployeeDataIssuesDigest(
                $newCount,
                $highOpen,
                $openTotal,
                $url,
                $breakdown,
            ));

            $scope(EmployeeDataIssue::query())
                ->whereNull('first_notified_at')
                ->update(['first_notified_at' => now()]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** @return array{company_id:?int, employee_id:int, employee_name:string, category:string, severity:string, detail:string} */
    private function issue(object $e, string $category, string $severity, string $detail): array
    {
        return [
            'company_id' => $e->company_id,
            'employee_id' => (int) $e->id,
            'employee_name' => Employee::formatName($e->first_name, $e->last_name),
            'category' => $category,
            'severity' => $severity,
            'detail' => $detail,
        ];
    }
}
