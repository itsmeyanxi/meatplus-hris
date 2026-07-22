<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * Recomputes DailyTimeRecords for active employees over a window so that
 * scheduled workdays with no punch (and no leave/holiday/COA/OB) are marked
 * ABSENT and show on the calendar. Only processes complete days (up to
 * yesterday) so today's in-progress attendance is never mis-flagged absent.
 * Contractual / no-schedule staff are never marked absent (handled in DtrComputer).
 */
class SyncDtr extends Command
{
    protected $signature = 'attendance:sync-dtr
        {--from= : Start date Y-m-d (default: --days before end)}
        {--to= : End date Y-m-d (default: yesterday; never past yesterday)}
        {--days=45 : Lookback window when --from is omitted}';

    protected $description = 'Recompute DTRs so no-punch scheduled workdays show as absent (contractual/no-schedule staff exempt).';

    public function handle(DtrComputer $computer): int
    {
        $yesterday = CarbonImmutable::today()->subDay();

        $to = $this->option('to') ? CarbonImmutable::parse($this->option('to')) : $yesterday;
        if ($to->gt($yesterday)) {
            $to = $yesterday; // never determine absence for today or the future
        }
        $from = $this->option('from')
            ? CarbonImmutable::parse($this->option('from'))
            : $to->subDays((int) $this->option('days'));

        if ($from->gt($to)) {
            $this->warn('Nothing to do (from is after to).');

            return self::SUCCESS;
        }

        $employees = Employee::query()->where('is_active', true)->get();
        $this->info("Syncing DTRs {$from->toDateString()} → {$to->toDateString()} for {$employees->count()} active employees…");

        $before = DailyTimeRecord::query()->where('is_absent', true)
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->count();

        $bar = $this->output->createProgressBar($employees->count());
        foreach ($employees as $employee) {
            $computer->computeForEmployee($employee, $from, $to);
            $bar->advance();
        }
        $bar->finish();
        $this->newLine();

        $after = DailyTimeRecord::query()->where('is_absent', true)
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])->count();

        $this->info("Done. Absent (scheduled, no-punch) DTRs in range: {$before} → {$after}.");

        return self::SUCCESS;
    }
}
