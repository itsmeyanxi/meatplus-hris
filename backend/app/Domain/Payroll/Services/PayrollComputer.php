<?php

namespace App\Domain\Payroll\Services;

use App\Domain\Attendance\Models\DailyTimeRecord;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\PayrollRun;
use App\Domain\Payroll\Models\Payslip;
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
        $comps = EmployeeCompensation::query()
            ->where('company_id', $run->company_id)
            ->where('is_active', true)
            ->with('employee:id,first_name,last_name,is_active,is_confidential')
            ->get();

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
                if (! $comp->employee || ! $comp->employee->is_active) {
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
                $daysWorked++;
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
        $overtimePay = round(($otMinutes / 60) * $hourlyRate * 1.25, 2);
        $nightDiffPay = round(($nightMinutes / 60) * $hourlyRate * 0.10, 2); // 10% night differential
        $tardinessDeduction = round($lateMinutes * $minuteRate, 2);

        $grossPay = round($basicPay + $allowance + $overtimePay + $nightDiffPay + $holidayPremium + $restDayPremium, 2);

        // Statutory + tax (monthly figures, split across two cutoffs).
        $contrib = $this->statutory->monthlyContributions($basicMonthly);
        $sss = round($contrib['sss'] / 2, 2);
        $philhealth = round($contrib['philhealth'] / 2, 2);
        $pagibig = round($contrib['pagibig'] / 2, 2);

        $taxableMonthly = max(0, $basicMonthly - ($contrib['sss'] + $contrib['philhealth'] + $contrib['pagibig']));
        $tax = round($this->statutory->monthlyTax($taxableMonthly) / 2, 2);

        $totalDeductions = round(
            $sss + $philhealth + $pagibig + $tax + $absencesDeduction + $tardinessDeduction,
            2,
        );
        // Net can never be negative — a shortfall (deductions > earnings) is carried
        // by the employer for the cutoff rather than billed back to the employee.
        $netPay = max(0.0, round($grossPay - $totalDeductions, 2));

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
            'allowance' => $allowance,
            'gross_pay' => $grossPay,
            'sss' => $sss,
            'philhealth' => $philhealth,
            'pagibig' => $pagibig,
            'withholding_tax' => $tax,
            'absences_deduction' => $absencesDeduction,
            'tardiness_deduction' => $tardinessDeduction,
            'total_deductions' => $totalDeductions,
            'net_pay' => $netPay,
        ]);
    }
}
