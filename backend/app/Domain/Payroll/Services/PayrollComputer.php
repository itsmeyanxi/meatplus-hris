<?php

namespace App\Domain\Payroll\Services;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\EmployeeLoan;
use App\Domain\Payroll\Models\EmployeePayrollProfile;
use App\Domain\Payroll\Models\PayrollRun;
use App\Domain\Payroll\Models\Payslip;
use App\Domain\Payroll\Models\PayslipAdjustment;
use Illuminate\Support\Facades\DB;

/**
 * Computes payslips for a payroll run. Semi-monthly model: one run covers a
 * cutoff, so monthly figures (basic, statutory, tax) are split in half. Earnings
 * are reduced by absences and tardiness pulled from the period's daily records;
 * overtime is paid at 1.25x the hourly rate. Only employees with an active
 * compensation record are included.
 */
class PayrollComputer
{
    /** Average working days per month, used to derive the daily rate. */
    private const WORKDAYS_PER_MONTH = 22;

    /** Hours in a standard working day, used to convert between daily and hourly. */
    private const HOURS_PER_DAY = 8;

    public function __construct(private readonly StatutoryCalculator $statutory) {}

    /**
     * (Re)compute all payslips for a run. Returns a summary.
     *
     * @return array{employees:int, skipped:int, gross:float, net:float}
     */
    public function computeRun(PayrollRun $run): array
    {
        // Point-in-time salary: for each employee use the compensation record
        // effective for THIS cutoff — the one with the latest effective_from on or
        // before the cutoff's end date — not merely whichever row is flagged active.
        // So a raise effective mid-cutoff is paid at the new rate for that cutoff,
        // and a future-dated raise doesn't apply until its effective date lands in
        // the period. (effective_from null = always in effect.)
        $comps = EmployeeCompensation::query()
            ->where('company_id', $run->company_id)
            ->where(fn ($q) => $q->whereNull('effective_from')->orWhereDate('effective_from', '<=', $run->period_end->toDateString()))
            ->with('employee:id,first_name,last_name,is_active,is_confidential,date_hired,date_separated')
            ->orderBy('employee_id')
            ->orderByDesc('effective_from')
            ->orderByDesc('id')
            ->get()
            ->unique('employee_id')   // ordered latest-effective first, so keep that one per employee
            ->values();

        // Optional payroll group: run only the confidential or only the
        // non-confidential employees (null = everyone).
        if ($run->pay_group === 'confidential') {
            $comps = $comps->filter(fn ($c) => $c->employee?->is_confidential);
        } elseif ($run->pay_group === 'non_confidential') {
            $comps = $comps->filter(fn ($c) => $c->employee && ! $c->employee->is_confidential);
        }

        $employees = 0;
        $skipped = 0;
        $gross = 0.0;
        $net = 0.0;

        DB::transaction(function () use ($run, $comps, &$employees, &$skipped, &$gross, &$net) {
            // Recompute from scratch.
            $run->payslips()->delete();

            foreach ($comps as $comp) {
                $emp = $comp->employee;
                // Don't pay: no employee, flagged inactive, already separated on/before
                // this cutoff (resigned/terminated — final pay is a separate flow), or
                // not yet hired as of the cutoff end.
                if (! $emp
                    || ! $emp->is_active
                    || ($emp->date_separated && $emp->date_separated->lte($run->period_end))
                    || ($emp->date_hired && $emp->date_hired->gt($run->period_end))) {
                    $skipped++;
                    continue;
                }

                $slip = $this->computeEmployee($run, $comp);
                $employees++;
                $gross += (float) $slip->gross_pay;
                $net += (float) $slip->net_pay;
            }

            $run->forceFill(['status' => 'computed', 'computed_at' => now()])->save();
        });

        return ['employees' => $employees, 'skipped' => $skipped, 'gross' => round($gross, 2), 'net' => round($net, 2)];
    }

    /**
     * Recurring loan amortizations for the employee, each capped at its remaining
     * balance. Balances are NOT drawn down here (compute is re-runnable) — that
     * happens once, when the run is posted, from the stored breakdown.
     *
     * @return array{0: float, 1: array<int, array{loan_id:int, type:string, amount:float}>}
     */
    private function loansFor(int $employeeId): array
    {
        $total = 0.0;
        $items = [];
        $loans = EmployeeLoan::query()
            ->where('employee_id', $employeeId)
            ->where('is_active', true)
            ->where('outstanding_balance', '>', 0)
            ->where('amortization', '>', 0)
            ->get();

        foreach ($loans as $loan) {
            $amount = round(min((float) $loan->amortization, (float) $loan->outstanding_balance), 2);
            if ($amount <= 0) {
                continue;
            }
            $total += $amount;
            $items[] = ['loan_id' => $loan->id, 'type' => $loan->type, 'amount' => $amount];
        }

        return [round($total, 2), $items];
    }

    /**
     * One-off earnings/deductions applied to this employee in this run.
     *
     * @return array{0: float, 1: float, 2: array<int, array{label:string, kind:string, amount:float}>}
     */
    private function adjustmentsFor(PayrollRun $run, int $employeeId): array
    {
        $earnings = 0.0;
        $deductions = 0.0;
        $items = [];
        $adjustments = PayslipAdjustment::query()
            ->where('payroll_run_id', $run->id)
            ->where('employee_id', $employeeId)
            ->get();

        foreach ($adjustments as $adj) {
            $amount = round((float) $adj->amount, 2);
            if ($adj->kind === 'earning') {
                $earnings += $amount;
            } else {
                $deductions += $amount;
            }
            $items[] = ['label' => $adj->label, 'kind' => $adj->kind, 'amount' => $amount];
        }

        return [round($earnings, 2), round($deductions, 2), $items];
    }

    /**
     * The premium OVER ordinary pay (100%) for regular hours worked on a special
     * day, per DOLE. Ordinary days = 0. Rest day or special non-working day = +30%.
     * Regular holiday = +100%. Combinations stack (e.g. a regular holiday that is
     * also the employee's rest day = +160%).
     */
    private function premiumExtra(?string $holidayType, bool $isRestDay): float
    {
        $extra = 0.0;
        if ($holidayType === 'regular') {
            $extra += 1.00;
        } elseif ($holidayType === 'special_non_working') {
            $extra += 0.30;
        }
        if ($isRestDay) {
            $extra += 0.30;
        }

        return $extra;
    }

    /**
     * Draw each employee's loan amortizations off their outstanding balance when a
     * run is posted. Uses the amounts recorded on each payslip's breakdown so it
     * matches exactly what was deducted, and runs once (posted runs can't recompute
     * or re-post). Deactivates loans that reach a zero balance.
     */
    public function drawDownLoans(PayrollRun $run): void
    {
        DB::transaction(function () use ($run) {
            $payslips = $run->payslips()->whereNotNull('breakdown')->get();
            foreach ($payslips as $slip) {
                foreach ($slip->breakdown['loans'] ?? [] as $line) {
                    $loan = EmployeeLoan::find($line['loan_id'] ?? null);
                    if (! $loan) {
                        continue;
                    }
                    $newBalance = max(0, round((float) $loan->outstanding_balance - (float) $line['amount'], 2));
                    $loan->forceFill([
                        'outstanding_balance' => $newBalance,
                        'is_active' => $newBalance > 0 ? $loan->is_active : false,
                    ])->save();
                }
            }
        });
    }

    private function computeEmployee(PayrollRun $run, EmployeeCompensation $comp): Payslip
    {
        // Three pay models. Hourly (part-time) staff earn per hour actually worked;
        // daily-paid earn per day worked; monthly-salaried earn a fixed amount
        // reduced by absences. Statutory contributions and tax are always based on
        // the MONTHLY-equivalent salary.
        $isDaily = $comp->pay_type === 'daily';
        $isHourly = $comp->pay_type === 'hourly';
        if ($isHourly) {
            $hourlyRate = (float) $comp->hourly_rate;
            $dailyRate = $hourlyRate * self::HOURS_PER_DAY;
            $basicMonthly = $dailyRate * self::WORKDAYS_PER_MONTH; // monthly-equivalent for statutory/tax
        } elseif ($isDaily) {
            $dailyRate = (float) $comp->daily_rate;
            $basicMonthly = $dailyRate * self::WORKDAYS_PER_MONTH;
            $hourlyRate = $dailyRate / self::HOURS_PER_DAY;
        } else {
            $basicMonthly = (float) $comp->basic_monthly;
            $dailyRate = $basicMonthly / self::WORKDAYS_PER_MONTH;
            $hourlyRate = $dailyRate / self::HOURS_PER_DAY;
        }
        $minuteRate = $dailyRate / 480;

        // Attendance totals for the cutoff.
        $dtrs = DailyTimeRecord::query()
            ->where('employee_id', $comp->employee_id)
            ->whereBetween('work_date', [$run->period_start->toDateString(), $run->period_end->toDateString()])
            ->get();

        $daysWorked = 0.0;   // paid days: worked, approved leave, or a (paid) holiday
        $daysAbsent = 0;
        $scheduledDays = 0;  // days the employee was expected to work (not a rest day)
        $lateMinutes = 0;
        $otMinutes = 0;
        $nightMinutes = 0;
        // Premium pay accrued for hours actually worked on holidays / rest days,
        // over and above the ordinary pay those hours already earn (see below).
        $holidayPremium = 0.0;
        $restDayPremium = 0.0;
        foreach ($dtrs as $d) {
            if (! $d->is_rest_day) {
                $scheduledDays++;
            }
            if ($d->is_absent) {
                $daysAbsent++;
            } elseif (! $d->is_rest_day && ((float) $d->hours_worked > 0 || $d->actual_in || $d->is_on_leave || $d->holiday_type)) {
                // Pay by the day's fraction — an official half-day pays 0.5.
                $daysWorked += (float) ($d->day_fraction ?? 1.0);
            }
            $lateMinutes += (int) $d->late_minutes;
            $otMinutes += (int) $d->overtime_minutes;
            $nightMinutes += (int) $d->night_diff_minutes;

            // Premium for the regular (first 8h) hours worked on a special day.
            // Ordinary hours already earn 100% via basic pay above, so we add only
            // the EXTRA over 100%: regular holiday +100%, special day/rest day +30%,
            // and the combinations stack (per DOLE). No work on the day → no premium.
            $regularHours = min((float) $d->hours_worked, self::HOURS_PER_DAY);
            if ($regularHours <= 0) {
                continue;
            }
            $extra = $this->premiumExtra($d->holiday_type, (bool) $d->is_rest_day);
            if ($extra <= 0) {
                continue;
            }
            $amount = round($hourlyRate * $regularHours * $extra, 2);
            if ($d->holiday_type) {
                $holidayPremium += $amount;
            } else {
                $restDayPremium += $amount;
            }
        }
        $holidayPremium = round($holidayPremium, 2);
        $restDayPremium = round($restDayPremium, 2);

        // Pay strictly by attendance.
        //  • Daily-paid: rate × days worked.
        //  • Monthly: prorate the fixed semi-monthly salary by (paid days ÷ scheduled
        //    days) — full attendance = full pay, every absence lowers it, and NO
        //    attendance for the cutoff pays nothing. Worked days, approved leave, and
        //    holidays all count as paid.
        // Unworked days are simply unpaid, so there is no separate absence deduction.
        $fullSemiMonthly = round($basicMonthly / 2, 2);
        if ($isDaily) {
            $basicPay = round($dailyRate * $daysWorked, 2);
        } else {
            $ratio = $scheduledDays > 0 ? min(1.0, $daysWorked / $scheduledDays) : 0.0;
            $basicPay = round($fullSemiMonthly * $ratio, 2);
        }
        $absencesDeduction = 0.0;
        $allowance = round((float) $comp->allowance_monthly / 2, 2);
        // De-minimis benefit (tax-exempt) from the payroll profile — fixed per
        // cutoff (halved from the monthly figure), added to pay but NOT taxed.
        $deMinimis = round((float) (EmployeePayrollProfile::where('employee_id', $comp->employee_id)->value('de_minimis') ?? 0) / 2, 2);
        $overtimePay = round(($otMinutes / 60) * $hourlyRate * 1.25, 2);
        $nightDiffPay = round(($nightMinutes / 60) * $hourlyRate * 0.10, 2); // 10% night differential
        $tardinessDeduction = round($lateMinutes * $minuteRate, 2);

        // One-off adjustments for this run (bonus, backpay, uniform, correction…).
        [$otherEarnings, $otherDeductions, $adjustmentBreakdown] = $this->adjustmentsFor($run, $comp->employee_id);

        $grossPay = round($basicPay + $allowance + $deMinimis + $overtimePay + $nightDiffPay + $holidayPremium + $restDayPremium + $otherEarnings, 2);

        // Statutory + tax (monthly figures, split across two cutoffs).
        $contrib = $this->statutory->monthlyContributions($basicMonthly);
        $sss = round($contrib['sss'] / 2, 2);
        $philhealth = round($contrib['philhealth'] / 2, 2);
        $pagibig = round($contrib['pagibig'] / 2, 2);

        $taxableMonthly = max(0, $basicMonthly - ($contrib['sss'] + $contrib['philhealth'] + $contrib['pagibig']));
        $tax = round($this->statutory->monthlyTax($taxableMonthly) / 2, 2);

        // Recurring loan amortizations (capped at each loan's remaining balance).
        [$loansDeduction, $loanBreakdown] = $this->loansFor($comp->employee_id);

        $totalDeductions = round(
            $sss + $philhealth + $pagibig + $tax + $absencesDeduction + $tardinessDeduction + $loansDeduction + $otherDeductions,
            2,
        );
        // Net can never be negative — a shortfall (deductions > earnings) is carried
        // by the employer for the cutoff rather than billed back to the employee.
        $netPay = max(0.0, round($grossPay - $totalDeductions, 2));

        // Itemized detail for transparency + the post() loan draw-down.
        $breakdown = array_filter([
            'loans' => $loanBreakdown ?: null,
            'adjustments' => $adjustmentBreakdown ?: null,
        ]);

        return Payslip::create([
            'payroll_run_id' => $run->id,
            'company_id' => $run->company_id,
            'employee_id' => $comp->employee_id,
            'days_worked' => $daysWorked,
            'days_absent' => $daysAbsent,
            'late_minutes' => $lateMinutes,
            'overtime_minutes' => $otMinutes,
            'night_diff_minutes' => $nightMinutes,
            'basic_pay' => $basicPay,
            'overtime_pay' => $overtimePay,
            'night_diff_pay' => $nightDiffPay,
            'holiday_pay' => $holidayPremium,
            'rest_day_pay' => $restDayPremium,
            'other_earnings' => $otherEarnings,
            'allowance' => $allowance,
            'de_minimis' => $deMinimis,
            'gross_pay' => $grossPay,
            'sss' => $sss,
            'philhealth' => $philhealth,
            'pagibig' => $pagibig,
            'withholding_tax' => $tax,
            'absences_deduction' => $absencesDeduction,
            'tardiness_deduction' => $tardinessDeduction,
            'loans_deduction' => $loansDeduction,
            'other_deductions' => $otherDeductions,
            'total_deductions' => $totalDeductions,
            'net_pay' => $netPay,
            'breakdown' => $breakdown ?: null,
        ]);
    }
}
