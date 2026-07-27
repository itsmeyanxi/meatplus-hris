<?php

namespace App\Domain\Payroll\Services;

/**
 * Philippine statutory contributions and withholding tax.
 *
 * Values reflect the tables in force for 2025 (which carry into 2026 unless the
 * agencies issue new circulars):
 *   • SSS  — RA 11199 15% total rate (employee share 5%), MSC ₱5,000–₱35,000.
 *   • PhilHealth — 5% premium (employee share 2.5%), floor ₱10,000, ceiling ₱100,000.
 *   • Pag-IBIG (HDMF) — 1% employee below ₱1,500, else 2%, on a ₱5,000 fund-salary cap.
 *   • Withholding tax — BIR TRAIN monthly graduated table (effective 2023 onward).
 *
 * Rates/caps are constants at the top so HR/accounting can update them the moment
 * a new circular lands (e.g. Pag-IBIG's planned ₱10,000 cap). Employee shares are
 * what the payslip deducts; employer shares are exposed for remittance reports.
 */
class StatutoryCalculator
{
    // --- SSS (2025) ---
    private const SSS_MSC_MIN = 5000.0;
    private const SSS_MSC_MAX = 35000.0;
    private const SSS_EE_RATE = 0.05;   // employee share of the 15% total
    private const SSS_ER_RATE = 0.10;   // employer share

    // --- PhilHealth (2024–2025, premium frozen at 5%) ---
    private const PH_RATE = 0.05;        // total premium
    private const PH_FLOOR = 10000.0;
    private const PH_CEILING = 100000.0;

    // --- Pag-IBIG / HDMF ---
    private const PAGIBIG_CAP = 5000.0;  // fund-salary cap (bump to 10,000 when circular takes effect)
    private const PAGIBIG_EE_LOW = 0.01; // ≤ ₱1,500 monthly
    private const PAGIBIG_EE_HIGH = 0.02;
    private const PAGIBIG_ER_RATE = 0.02;

    /** Monthly employee-share contributions for a given monthly basic salary. */
    public function monthlyContributions(float $basicMonthly): array
    {
        return [
            'sss' => $this->sss($basicMonthly),
            'philhealth' => $this->philhealth($basicMonthly),
            'pagibig' => $this->pagibig($basicMonthly),
        ];
    }

    /** Monthly employer-share contributions (for SSS R3 / RF1 / MCRF remittance). */
    public function monthlyEmployerContributions(float $basicMonthly): array
    {
        return [
            'sss' => round($this->sssMsc($basicMonthly) * self::SSS_ER_RATE, 2),
            'philhealth' => $this->philhealth($basicMonthly), // 5% premium split evenly
            'pagibig' => round(min($basicMonthly, self::PAGIBIG_CAP) * self::PAGIBIG_ER_RATE, 2),
        ];
    }

    /** SSS employee share — 5% of the Monthly Salary Credit (₱5,000–₱35,000). */
    public function sss(float $basicMonthly): float
    {
        return round($this->sssMsc($basicMonthly) * self::SSS_EE_RATE, 2);
    }

    /** The Monthly Salary Credit: salary clamped to the MSC range, in ₱500 brackets. */
    private function sssMsc(float $basicMonthly): float
    {
        $clamped = max(self::SSS_MSC_MIN, min($basicMonthly, self::SSS_MSC_MAX));

        return round($clamped / 500) * 500; // nearest ₱500 MSC bracket
    }

    /** PhilHealth employee share — half of the 5% premium (floor ₱10k, ceiling ₱100k). */
    public function philhealth(float $basicMonthly): float
    {
        $base = max(self::PH_FLOOR, min($basicMonthly, self::PH_CEILING));

        return round($base * self::PH_RATE / 2, 2);
    }

    /** Pag-IBIG employee share — 1% up to ₱1,500, else 2%, on a ₱5,000 cap (max ₱100). */
    public function pagibig(float $basicMonthly): float
    {
        $rate = $basicMonthly <= 1500 ? self::PAGIBIG_EE_LOW : self::PAGIBIG_EE_HIGH;

        return round(min($basicMonthly, self::PAGIBIG_CAP) * $rate, 2);
    }

    /** TRAIN graduated monthly withholding tax on the given taxable monthly income. */
    public function monthlyTax(float $taxableMonthly): float
    {
        // BIR monthly withholding table, effective 2023 onward. [floor, base, rate].
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

        return 0.0; // ₱20,833 and below is tax-exempt
    }
}
