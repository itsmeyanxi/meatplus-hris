<?php

namespace App\Domain\Payroll\Services;

/**
 * Simplified Philippine statutory contributions and withholding tax (2024 bases).
 *
 * NOTE: These are reasonable approximations for a working payroll MVP, not an
 * official computation. SSS uses a flat EE rate on a clamped MSC (ignoring the
 * bracket table and MPF); PhilHealth and Pag-IBIG use clamped percentage shares;
 * tax uses the TRAIN monthly graduated table. HR/accounting should verify against
 * the current official contribution tables before live use.
 */
class StatutoryCalculator
{
    /** Monthly employee-share contributions for a given monthly basic salary. */
    public function monthlyContributions(float $basicMonthly): array
    {
        return [
            'sss' => $this->sss($basicMonthly),
            'philhealth' => $this->philhealth($basicMonthly),
            'pagibig' => $this->pagibig($basicMonthly),
        ];
    }

    /** SSS employee share — 4.5% of the monthly salary credit (clamped 4,000–30,000). */
    public function sss(float $basicMonthly): float
    {
        $msc = max(4000, min($basicMonthly, 30000));

        return round($msc * 0.045, 2);
    }

    /** PhilHealth employee share — 2.5% of basic (clamped 10,000–100,000). */
    public function philhealth(float $basicMonthly): float
    {
        $base = max(10000, min($basicMonthly, 100000));

        return round($base * 0.025, 2);
    }

    /** Pag-IBIG employee share — 2% of basic, capped at the 5,000 fund salary (max 100). */
    public function pagibig(float $basicMonthly): float
    {
        return round(min($basicMonthly, 5000) * 0.02, 2);
    }

    /** TRAIN graduated monthly withholding tax on the given taxable monthly income. */
    public function monthlyTax(float $taxableMonthly): float
    {
        $brackets = [
            [666667, 200833.33, 0.35],
            [166667, 40833.33, 0.30],
            [66667, 10833.33, 0.25],
            [33333, 2500.00, 0.20],
            [20833, 0.00, 0.15],
        ];

        foreach ($brackets as [$floor, $base, $rate]) {
            if ($taxableMonthly > $floor) {
                return round($base + ($taxableMonthly - $floor) * $rate, 2);
            }
        }

        return 0.0; // 20,833 and below is tax-exempt
    }
}
