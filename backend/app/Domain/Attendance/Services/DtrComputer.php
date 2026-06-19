<?php

namespace App\Domain\Attendance\Services;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\EmployeeSchedule;
use App\Domain\Attendance\Models\Holiday;
use App\Domain\Attendance\Models\ShiftAdjustment;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Models\WorkScheduleDay;
use App\Domain\HRIS\Models\Employee;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class DtrComputer
{
    /**
     * Compute (or recompute) DailyTimeRecords for an employee across [from, to].
     * Returns the upserted DTR rows. Locked rows are skipped.
     */
    public function computeForEmployee(Employee $employee, CarbonInterface $from, CarbonInterface $to): Collection
    {
        $from = CarbonImmutable::parse($from)->startOfDay();
        $to = CarbonImmutable::parse($to)->endOfDay();

        $assignments = EmployeeSchedule::query()
            ->with('workSchedule.days')
            ->where('employee_id', $employee->id)
            ->where('effective_from', '<=', $to->toDateString())
            ->where(function ($q) use ($from) {
                $q->whereNull('effective_to')->orWhere('effective_to', '>=', $from->toDateString());
            })
            ->get();

        $holidays = Holiday::query()
            ->whereBetween('holiday_date', [$from->toDateString(), $to->toDateString()])
            ->where(function ($q) use ($employee) {
                $q->whereNull('company_id')->orWhere('company_id', $employee->company_id);
            })
            ->where(function ($q) use ($employee) {
                $q->whereNull('applicable_branch_id')->orWhere('applicable_branch_id', $employee->branch_id);
            })
            ->get()
            ->keyBy(fn ($h) => $h->holiday_date->toDateString());

        $logs = TimeLog::query()
            ->where('employee_id', $employee->id)
            ->whereBetween('logged_at', [$from, $to])
            ->orderBy('logged_at')
            ->get()
            ->groupBy(fn (TimeLog $l) => $l->logged_at->toDateString());

        $adjustments = ShiftAdjustment::query()
            ->where('employee_id', $employee->id)
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])
            ->get()
            ->keyBy(fn (ShiftAdjustment $a) => $a->work_date->toDateString());

        $results = collect();

        for ($day = $from; $day->lte($to); $day = $day->addDay()) {
            $dateStr = $day->toDateString();

            $existing = DailyTimeRecord::query()
                ->where('employee_id', $employee->id)
                ->where('work_date', $dateStr)
                ->first();

            if ($existing && $existing->status === 'locked') {
                $results->push($existing);
                continue;
            }

            $scheduleDay = $this->resolveScheduleDay($assignments, $day);
            $holiday = $holidays->get($dateStr);
            $dayLogs = $logs->get($dateStr, collect());
            $adjustment = $adjustments->get($dateStr);

            $dtr = $this->computeDay($employee, $day, $scheduleDay, $holiday, $dayLogs, $adjustment);

            $row = DailyTimeRecord::updateOrCreate(
                ['employee_id' => $employee->id, 'work_date' => $dateStr],
                $dtr,
            );

            $results->push($row);
        }

        return $results;
    }

    /**
     * Stamp a holiday onto every applicable employee's calendar for its date by
     * (re)computing that single day's DTR for each. Honours the holiday's company
     * and branch scope, and skips locked rows. Returns the number of employees touched.
     */
    public function applyHolidayToEmployees(Holiday $holiday): int
    {
        $date = CarbonImmutable::parse($holiday->holiday_date);

        $employees = Employee::query()
            ->where('is_active', true)
            ->when($holiday->company_id, fn ($q) => $q->where('company_id', $holiday->company_id))
            ->when($holiday->applicable_branch_id, fn ($q) => $q->where('branch_id', $holiday->applicable_branch_id))
            ->get();

        foreach ($employees as $employee) {
            $this->computeForEmployee($employee, $date, $date);
        }

        return $employees->count();
    }

    /**
     * Stamp every applicable existing holiday onto a single employee's calendar —
     * the mirror of applyHolidayToEmployees(), used when a new employee is added so
     * they inherit holidays created before they existed. Only holiday dates are
     * computed, so non-holiday days are left untouched (no spurious "absent" rows).
     */
    public function applyHolidaysToEmployee(Employee $employee): int
    {
        $holidays = Holiday::query()
            ->where(function ($q) use ($employee) {
                $q->whereNull('company_id')->orWhere('company_id', $employee->company_id);
            })
            ->where(function ($q) use ($employee) {
                $q->whereNull('applicable_branch_id')->orWhere('applicable_branch_id', $employee->branch_id);
            })
            ->get();

        foreach ($holidays as $holiday) {
            $date = CarbonImmutable::parse($holiday->holiday_date);
            $this->computeForEmployee($employee, $date, $date);
        }

        return $holidays->count();
    }

    /**
     * Clear a now-removed/moved holiday from employee calendars on $date by
     * recomputing only the employees that currently carry a holiday marker there.
     * Bounded to those rows so we never fabricate fresh records for everyone.
     */
    public function clearHolidayOnDate(CarbonInterface $date, ?int $companyId, ?int $branchId): int
    {
        $date = CarbonImmutable::parse($date);

        $employeeIds = DailyTimeRecord::query()
            ->whereDate('work_date', $date->toDateString())
            ->whereNotNull('holiday_type')
            ->where('status', '!=', 'locked')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->pluck('employee_id');

        if ($employeeIds->isEmpty()) {
            return 0;
        }

        $employees = Employee::query()
            ->whereIn('id', $employeeIds)
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->get();

        foreach ($employees as $employee) {
            $this->computeForEmployee($employee, $date, $date);
        }

        return $employees->count();
    }

    private function resolveScheduleDay(Collection $assignments, CarbonInterface $day): ?WorkScheduleDay
    {
        $dow = (int) $day->dayOfWeek; // 0=Sun..6=Sat

        $active = $assignments->first(function (EmployeeSchedule $a) use ($day) {
            $from = $a->effective_from;
            $to = $a->effective_to;

            return $from <= $day && (! $to || $to >= $day);
        });

        if (! $active) {
            return null;
        }

        return $active->workSchedule->days->firstWhere('day_of_week', $dow);
    }

    /**
     * Resolve a day's scheduled in/out as datetimes, rolling the out time to the
     * next calendar day for overnight shifts (e.g. 22:00→06:00) so duration,
     * lateness and undertime are computed across midnight rather than backwards.
     *
     * @return array{0: ?CarbonImmutable, 1: ?CarbonImmutable}
     */
    private function scheduledWindow(string $dateStr, ?string $in, ?string $out): array
    {
        $si = $in ? CarbonImmutable::parse("{$dateStr} {$in}") : null;
        $so = $out ? CarbonImmutable::parse("{$dateStr} {$out}") : null;

        if ($si && $so && $so->lte($si)) {
            $so = $so->addDay();
        }

        return [$si, $so];
    }

    private function computeDay(
        Employee $employee,
        CarbonInterface $day,
        ?WorkScheduleDay $scheduleDay,
        ?Holiday $holiday,
        Collection $dayLogs,
        ?ShiftAdjustment $adjustment = null,
    ): array {
        $isRestDay = (bool) ($scheduleDay?->is_rest_day);
        $hasAnyLogs = $dayLogs->isNotEmpty();

        $actualIn = $dayLogs->firstWhere('direction', 'in')?->logged_at;
        $actualOut = $dayLogs->where('direction', 'out')->last()?->logged_at;

        $hoursWorked = 0.0;
        $lateMinutes = 0;
        $undertimeMinutes = 0;
        $overtimeMinutes = 0;

        $scheduledIn = $scheduleDay && ! $isRestDay ? $scheduleDay->time_in : null;
        $scheduledOut = $scheduleDay && ! $isRestDay ? $scheduleDay->time_out : null;
        $breakMinutes = (int) ($scheduleDay->break_minutes ?? 0);
        $breaksPaid = (bool) ($scheduleDay?->workSchedule?->breaks_paid ?? false);
        $requiredHours = (float) ($scheduleDay->required_hours ?? 0);

        // HR override: an adjustment replaces this day's shift entirely.
        $isAdjusted = (bool) $adjustment;
        if ($adjustment) {
            $isRestDay = $adjustment->is_rest_day;
            if ($isRestDay) {
                $scheduledIn = $scheduledOut = null;
                $breakMinutes = 0;
                $requiredHours = 0.0;
            } else {
                $scheduledIn = $adjustment->time_in;
                $scheduledOut = $adjustment->time_out;
                $breakMinutes = (int) ($adjustment->break_minutes ?? 60);
                [$si, $so] = $this->scheduledWindow($day->toDateString(), $scheduledIn, $scheduledOut);
                if ($si && $so) {
                    $requiredHours = round(max(0, $si->diffInMinutes($so) - $breakMinutes) / 60, 2);
                } else {
                    $requiredHours = 0.0;
                }
            }
        }

        if ($actualIn && $actualOut) {
            $minutes = $actualIn->diffInMinutes($actualOut);
            if (! $breaksPaid) {
                $minutes = max(0, $minutes - $breakMinutes);
            }
            $hoursWorked = round($minutes / 60, 2);

            [$schedIn, $schedOut] = $this->scheduledWindow($day->toDateString(), $scheduledIn, $scheduledOut);
            if ($schedIn && ! $isRestDay) {
                $lateMinutes = max(0, (int) round($schedIn->diffInMinutes($actualIn, false)));
            }
            if ($schedOut && ! $isRestDay) {
                $undertimeMinutes = max(0, (int) round($actualOut->diffInMinutes($schedOut, false)));
            }

            if ($requiredHours > 0) {
                $overMinutes = ($hoursWorked - $requiredHours) * 60;
                $overtimeMinutes = max(0, (int) round($overMinutes));
            } elseif ($isRestDay || $holiday) {
                // rest-day / holiday work — every minute is OT
                $overtimeMinutes = (int) round($hoursWorked * 60);
            }
        }

        $isAbsent = ! $hasAnyLogs && ! $isRestDay && ! $holiday;

        return [
            'company_id' => $employee->company_id,
            'scheduled_in' => $scheduledIn,
            'scheduled_out' => $scheduledOut,
            'actual_in' => $actualIn,
            'actual_out' => $actualOut,
            'hours_worked' => $hoursWorked,
            'late_minutes' => $lateMinutes,
            'undertime_minutes' => $undertimeMinutes,
            'overtime_minutes' => $overtimeMinutes,
            'night_diff_minutes' => 0, // deferred to Phase 2.1
            'holiday_type' => $holiday?->type,
            'is_rest_day' => $isRestDay,
            'is_absent' => $isAbsent,
            'is_on_leave' => false, // populated when leave module lands
            'is_adjusted' => $isAdjusted,
            'status' => 'draft',
        ];
    }
}
