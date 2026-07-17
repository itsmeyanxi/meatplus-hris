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
            ->with('employee:id,first_name,last_name,is_active')
            ->get();

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

    private function computeEmployee(PayrollRun $run, EmployeeCompensation $comp): Payslip
    {
        // Two pay models. Daily-paid staff earn per day actually worked; monthly-
        // salaried earn a fixed amount reduced by absences. Statutory contributions
        // and tax are always based on the MONTHLY-equivalent salary.
        $isDaily = $comp->pay_type === 'daily';
        if ($isDaily) {
            $dailyRate = (float) $comp->daily_rate;
            $basicMonthly = $dailyRate * self::WORKDAYS_PER_MONTH; // monthly-equivalent for statutory/tax
        } else {
            $basicMonthly = (float) $comp->basic_monthly;
            $dailyRate = $basicMonthly / self::WORKDAYS_PER_MONTH;
        }
        $hourlyRate = $dailyRate / 8;
        $minuteRate = $dailyRate / 480;

        // Attendance totals for the cutoff.
        $dtrs = DailyTimeRecord::query()
            ->where('employee_id', $comp->employee_id)
            ->whereBetween('work_date', [$run->period_start->toDateString(), $run->period_end->toDateString()])
            ->get();

        $daysWorked = 0.0;
        $daysAbsent = 0;
        $lateMinutes = 0;
        $otMinutes = 0;
        $nightMinutes = 0;
        foreach ($dtrs as $d) {
            if ($d->is_absent) {
                $daysAbsent++;
            } elseif (! $d->is_rest_day && ((float) $d->hours_worked > 0 || $d->actual_in || $d->is_on_leave)) {
                $daysWorked++;
            }
            $lateMinutes += (int) $d->late_minutes;
            $otMinutes += (int) $d->overtime_minutes;
            $nightMinutes += (int) $d->night_diff_minutes;
        }

        // Earnings. Daily-paid: pay per day worked (unworked days are simply unpaid,
        // so no separate absence deduction). Monthly: half the monthly salary, less
        // a deduction for each absent day.
        if ($isDaily) {
            $basicPay = round($dailyRate * $daysWorked, 2);
            $absencesDeduction = 0.0;
        } else {
            $basicPay = round($basicMonthly / 2, 2);
            $absencesDeduction = round($daysAbsent * $dailyRate, 2);
        }
        $allowance = round((float) $comp->allowance_monthly / 2, 2);
        $overtimePay = round(($otMinutes / 60) * $hourlyRate * 1.25, 2);
        $nightDiffPay = round(($nightMinutes / 60) * $hourlyRate * 0.10, 2); // 10% night differential
        $tardinessDeduction = round($lateMinutes * $minuteRate, 2);

        $grossPay = round($basicPay + $allowance + $overtimePay + $nightDiffPay, 2);

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
