<?php

namespace App\Domain\Attendance\Services;

use App\Domain\Attendance\Models\CertificateOfAttendanceRequest;
use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Attendance\Models\EmployeeSchedule;
use App\Domain\Attendance\Models\Holiday;
use App\Domain\Attendance\Models\OfficialBusinessRequest;
use App\Domain\Attendance\Models\OvertimeRequest;
use App\Domain\Attendance\Models\ShiftAdjustment;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Models\WorkScheduleDay;
use App\Domain\HRIS\Models\Employee;
use App\Domain\Leave\Models\LeaveApplication;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class DtrComputer
{
    /**
     * Minutes of allowance after the scheduled start before an arrival counts as
     * late. Within it the employee is on time; past it the full lateness applies.
     */
    public const LATE_GRACE_MINUTES = 15;

    /**
     * Longest a single shift may span from first punch to last. A missing out-punch
     * would otherwise pair an in-punch with the NEXT shift's punch, inventing a
     * 20-24 hour "day". 16h comfortably covers a 12-hour shift plus overtime while
     * rejecting overnight phantoms; a span beyond it means the out-punch is missing.
     */
    public const MAX_SHIFT_MINUTES = 16 * 60;

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

        // Punches belong to a SHIFT, not a calendar day. On an overnight shift
        // (22:00-07:00) the exit lands on the next date, so grouping by calendar day
        // would pair last night's exit with tonight's entry — inventing a 14-hour day.
        // Attribute an early punch to the previous day when that day's shift crossed
        // midnight and the punch falls inside its window (plus room for overtime).
        $logs = TimeLog::query()
            ->where('employee_id', $employee->id)
            ->whereBetween('logged_at', [$from->subDay(), $to->addDay()])
            ->orderBy('logged_at')
            ->get()
            ->groupBy(function (TimeLog $l) use ($assignments) {
                $date = $l->logged_at->toDateString();
                $prevDay = $l->logged_at->subDay()->startOfDay();
                $prev = $this->resolveScheduleDay($assignments, $prevDay);

                if ($prev && ! $prev->is_rest_day && $prev->time_in && $prev->time_out) {
                    [$si, $so] = $this->scheduledWindow($prevDay->toDateString(), $prev->time_in, $prev->time_out);
                    // $so rolls past midnight only when the shift is overnight.
                    if ($si && $so && $so->greaterThan($si->endOfDay()) && $l->logged_at->lessThanOrEqualTo($so->addHours(4))) {
                        return $prevDay->toDateString();
                    }
                }

                return $date;
            });

        $adjustments = ShiftAdjustment::query()
            ->where('employee_id', $employee->id)
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])
            ->get()
            ->keyBy(fn (ShiftAdjustment $a) => $a->work_date->toDateString());

        // Approved leave overlapping the window, expanded to a per-day map.
        $leaveByDate = [];
        $leaves = LeaveApplication::query()
            ->where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->where('date_from', '<=', $to->toDateString())
            ->where('date_to', '>=', $from->toDateString())
            ->with('leaveType:id,is_paid')
            ->get();
        foreach ($leaves as $lv) {
            for ($d = CarbonImmutable::parse($lv->date_from); $d->lte(CarbonImmutable::parse($lv->date_to)); $d = $d->addDay()) {
                $leaveByDate[$d->toDateString()] = $lv;
            }
        }

        // Overtime is credited ONLY from an overtime request that was actually FILED
        // in the app and approved — never auto-marked. Bulk-imported OT (no filer and
        // no ticket number) is ignored, so it can't silently credit/pay OT.
        $overtimes = OvertimeRequest::query()
            ->where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->where(fn ($q) => $q->whereNotNull('filed_by_user_id')->orWhereNotNull('ticket_number'))
            ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
            ->get()
            ->keyBy(fn (OvertimeRequest $o) => $o->date->toDateString());

        // Approved Certificate of Attendance — certifies presence for a single day.
        $coas = CertificateOfAttendanceRequest::query()
            ->where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->whereBetween('work_date', [$from->toDateString(), $to->toDateString()])
            ->get()
            ->keyBy(fn (CertificateOfAttendanceRequest $c) => $c->work_date->toDateString());

        // Approved Official Business — employee out on business, expanded across its range.
        $obByDate = [];
        $obs = OfficialBusinessRequest::query()
            ->where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->where('date', '<=', $to->toDateString())
            ->where(function ($q) use ($from) {
                $q->whereNull('date_to')->orWhere('date_to', '>=', $from->toDateString());
            })
            ->get();
        foreach ($obs as $ob) {
            $end = $ob->date_to ?? $ob->date;
            for ($d = CarbonImmutable::parse($ob->date); $d->lte(CarbonImmutable::parse($end)); $d = $d->addDay()) {
                $obByDate[$d->toDateString()] = $ob;
            }
        }

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

            $dtr = $this->computeDay(
                $employee, $day, $scheduleDay, $holiday, $dayLogs, $adjustment,
                $leaveByDate[$dateStr] ?? null, $overtimes->get($dateStr),
                $coas->get($dateStr), $obByDate[$dateStr] ?? null,
            );

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
        ?LeaveApplication $leave = null,
        ?OvertimeRequest $overtime = null,
        ?CertificateOfAttendanceRequest $coa = null,
        ?OfficialBusinessRequest $ob = null,
    ): array {
        // Only employees on a regular schedule are absence-tracked. Contractual /
        // no-schedule staff have no $scheduleDay for the day and are never marked
        // absent (they're a separate group whose attendance isn't schedule-based).
        $hasSchedule = $scheduleDay !== null || (bool) $adjustment;
        $isRestDay = (bool) ($scheduleDay?->is_rest_day);
        $hasAnyLogs = $dayLogs->isNotEmpty();

        // Clock ORDER decides in/out — not the device's in/out flag. Biometric units
        // often report the wrong status (or none, leaving it to be guessed), which
        // produced days with the "in" later than the "out" and zero hours worked.
        // The first punch of the day is the arrival, the last is the departure.
        $sortedLogs = $dayLogs->sortBy('logged_at')->values();
        $actualIn = $sortedLogs->first()?->logged_at;
        $actualOut = $sortedLogs->count() > 1 ? $sortedLogs->last()?->logged_at : null;

        // Cap the shift span: if the last punch is more than MAX_SHIFT_MINUTES after
        // the first, that punch belongs to a later shift (the real out-punch was
        // missed). Re-pick the out as the latest punch still within the cap; if none
        // qualifies, leave the day without a time-out (incomplete) rather than
        // fabricating a 20-24 hour shift.
        if ($actualIn && $actualOut && $actualIn->diffInMinutes($actualOut) > self::MAX_SHIFT_MINUTES) {
            $cutoff = $actualIn->addMinutes(self::MAX_SHIFT_MINUTES);
            // Latest punch still within the cap window becomes the out-punch (logs are
            // ascending, so scan from the end); if none qualifies, no time-out.
            $withinLast = $sortedLogs->reverse()->first(
                fn ($l) => $l->logged_at->greaterThan($actualIn) && $l->logged_at->lessThanOrEqualTo($cutoff),
            );
            $actualOut = $withinLast?->logged_at;
        }

        // A single punch is ambiguous: count it as a departure when it falls nearer
        // the scheduled end than the scheduled start, otherwise as an arrival.
        if ($sortedLogs->count() === 1 && $scheduleDay && ! $isRestDay
            && $scheduleDay->time_in && $scheduleDay->time_out) {
            $only = $sortedLogs->first()->logged_at;
            [$si, $so] = $this->scheduledWindow($day->toDateString(), $scheduleDay->time_in, $scheduleDay->time_out);
            if (abs($only->diffInMinutes($so)) < abs($only->diffInMinutes($si))) {
                $actualIn = null;
                $actualOut = $only;
            }
        }

        // An approved COA is the employee's declaration of the punch they missed, so
        // it supplies whichever side has no punch. Previously the day was only marked
        // excused: the claimed time never appeared and no hours were credited.
        if ($coa) {
            $asTime = static function ($v): ?string {
                if ($v === null || $v === '') {
                    return null;
                }

                return $v instanceof \DateTimeInterface ? $v->format('H:i:s') : substr((string) $v, 0, 8);
            };
            $claimedIn = $asTime($coa->claimed_time_in);
            $claimedOut = $asTime($coa->claimed_time_out);

            if (! $actualIn && $claimedIn) {
                $actualIn = CarbonImmutable::parse($day->toDateString().' '.$claimedIn);
            }
            if (! $actualOut && $claimedOut) {
                $actualOut = CarbonImmutable::parse($day->toDateString().' '.$claimedOut);
                if ($actualIn && $actualOut->lessThanOrEqualTo($actualIn)) {
                    $actualOut = $actualOut->addDay(); // shift ran past midnight
                }
            }
        }

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
                // Grace period: arriving within the allowance is not late at all.
                // Past it, the full lateness from the scheduled start counts.
                if ($lateMinutes <= self::LATE_GRACE_MINUTES) {
                    $lateMinutes = 0;
                }
                // Flexible-schedule staff aren't penalised for arrival time.
                if (in_array($employee->schedule_type ?? 'regular', Employee::NO_LATE_TYPES, true)) {
                    $lateMinutes = 0;
                }
            }
            if ($schedOut && ! $isRestDay) {
                $undertimeMinutes = max(0, (int) round($actualOut->diffInMinutes($schedOut, false)));
            }

            // Regular scheduled days do NOT auto-earn OT for working past the shift —
            // overtimeMinutes stays 0 unless a filed & approved OT request sets it below.
            // Rest-day / holiday work is fully off-schedule, so its hours are credited
            // (this is how those days are paid, not stay-late overtime).
            if (($isRestDay || $holiday) && $requiredHours <= 0) {
                $overtimeMinutes = (int) round($hoursWorked * 60);
            }
        }

        // A FILED, approved overtime request is authoritative for credited OT on its date.
        if ($overtime) {
            $overtimeMinutes = (int) round((float) $overtime->requested_hours * 60);
        }

        // Night differential: worked minutes that fall within 22:00–06:00.
        $nightDiffMinutes = ($actualIn && $actualOut)
            ? $this->nightDiffMinutes($day->toDateString(), $actualIn, $actualOut)
            : 0;

        // Approved leave: paid leave is not absent; unpaid leave still deducts (absent)
        // but is flagged on-leave for display.
        $onLeave = (bool) $leave;
        $leavePaid = $onLeave && (bool) ($leave->leaveType?->is_paid ?? true);

        // Certificate of Attendance or Official Business certifies presence: the day
        // is excused (not absent) and, with no punch, credited the scheduled hours.
        $excused = (bool) ($coa || $ob);
        if ($excused && ! $hasAnyLogs && $requiredHours > 0) {
            $hoursWorked = $requiredHours;
        }

        // Staff not required to time in/out (supervisors, office staff) are treated as
        // ALWAYS PRESENT: never absent, and on a scheduled workday with no punches they
        // are credited their scheduled hours so payroll pays them a full day.
        $punchExempt = ! (bool) ($employee->time_in_out_required ?? true);
        if ($punchExempt && ! $hasAnyLogs && ! $isRestDay && $requiredHours > 0) {
            $hoursWorked = $requiredHours;
        }

        // Absent = a SCHEDULED workday with no attendance and nothing that excuses it
        // (rest day, holiday, paid leave, COA, OB, or being punch-exempt). Unscheduled/
        // contractual staff are never absent.
        $isAbsent = $hasSchedule && ! $hasAnyLogs && ! $isRestDay && ! $holiday && ! $leavePaid && ! $excused && ! $punchExempt;

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
            'night_diff_minutes' => $nightDiffMinutes,
            'holiday_type' => $holiday?->type,
            'is_rest_day' => $isRestDay,
            'is_absent' => $isAbsent,
            'is_on_leave' => $onLeave,
            'leave_application_id' => $leave?->id,
            'is_adjusted' => $isAdjusted,
            'status' => 'draft',
        ];
    }

    /** Minutes of the worked span [in, out] that fall within the 22:00–06:00 night window. */
    private function nightDiffMinutes(string $dateStr, CarbonInterface $in, CarbonInterface $out): int
    {
        $in = CarbonImmutable::parse($in);
        $out = CarbonImmutable::parse($out);

        // Two windows relative to the work date: early morning and late night (into next day).
        $windows = [
            [CarbonImmutable::parse("{$dateStr} 00:00"), CarbonImmutable::parse("{$dateStr} 06:00")],
            [CarbonImmutable::parse("{$dateStr} 22:00"), CarbonImmutable::parse("{$dateStr} 06:00")->addDay()],
        ];

        $minutes = 0;
        foreach ($windows as [$ws, $we]) {
            $start = $in->greaterThan($ws) ? $in : $ws;
            $end = $out->lessThan($we) ? $out : $we;
            if ($end->greaterThan($start)) {
                $minutes += (int) round($start->diffInMinutes($end));
            }
        }

        return $minutes;
    }
}
