<?php

namespace App\Domain\Attendance\Services;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\EmployeeSchedule;
use App\Domain\Attendance\Models\Holiday;
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

            $dtr = $this->computeDay($employee, $day, $scheduleDay, $holiday, $dayLogs);

            $row = DailyTimeRecord::updateOrCreate(
                ['employee_id' => $employee->id, 'work_date' => $dateStr],
                $dtr,
            );

            $results->push($row);
        }

        return $results;
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

    private function computeDay(
        Employee $employee,
        CarbonInterface $day,
        ?WorkScheduleDay $scheduleDay,
        ?Holiday $holiday,
        Collection $dayLogs,
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

        if ($actualIn && $actualOut) {
            $minutes = $actualIn->diffInMinutes($actualOut);
            if (! $breaksPaid) {
                $minutes = max(0, $minutes - $breakMinutes);
            }
            $hoursWorked = round($minutes / 60, 2);

            if ($scheduledIn && ! $isRestDay) {
                $schedIn = CarbonImmutable::parse($day->toDateString().' '.$scheduledIn);
                $lateMinutes = max(0, (int) $schedIn->diffInMinutes($actualIn, false));
            }
            if ($scheduledOut && ! $isRestDay) {
                $schedOut = CarbonImmutable::parse($day->toDateString().' '.$scheduledOut);
                $undertimeMinutes = max(0, (int) $actualOut->diffInMinutes($schedOut, false));
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
            'status' => 'draft',
        ];
    }
}
