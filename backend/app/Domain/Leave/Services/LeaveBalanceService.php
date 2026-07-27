<?php

namespace App\Domain\Leave\Services;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Leave\Models\LeaveBalance;
use App\Domain\Leave\Models\LeaveType;
use Illuminate\Support\Facades\DB;

class LeaveBalanceService
{
    /**
     * Get or create the LeaveBalance row for (employee, leave type, year).
     * Initializes `opening_balance` from leave_types.default_credits_per_year on first creation.
     */
    public function ensureBalance(Employee $employee, LeaveType $type, int $year): LeaveBalance
    {
        return LeaveBalance::firstOrCreate(
            ['employee_id' => $employee->id, 'leave_type_id' => $type->id, 'year' => $year],
            ['opening_balance' => $type->default_credits_per_year, 'used' => 0],
        );
    }

    /**
     * Whether a leave type draws down a running credit balance. Only paid types
     * that carry an actual allocation (a default grant, an opening balance, an
     * ad-hoc grant, or accrual) are credit-tracked. Unpaid leaves (e.g. LWOP)
     * and paid-but-uncredited statutory leaves (Maternity, Paternity, Solo
     * Parent, Bereavement) are NOT — they're filed freely and the approver is
     * the control, so they must never be blocked by a zero balance.
     */
    public function isCreditTracked(LeaveType $type, LeaveBalance $balance): bool
    {
        return $type->is_paid && (
            (float) $type->default_credits_per_year > 0
            || (float) $balance->opening_balance > 0
            || (float) $balance->granted_adhoc > 0
            || (float) $balance->accrued > 0
        );
    }

    /**
     * Consume balance when a leave is approved.
     * Uses the leave's date_from year as the bucket — single-year leaves only for now.
     * Cross-year leaves are deferred to Phase 3.1.
     */
    public function consume(LeaveBalance $balance, float $days): void
    {
        DB::transaction(function () use ($balance, $days) {
            $balance->increment('used', $days);
        });
    }

    /**
     * Restore balance when an approved leave is cancelled.
     */
    public function restore(LeaveBalance $balance, float $days): void
    {
        DB::transaction(function () use ($balance, $days) {
            $balance->decrement('used', $days);
        });
    }
}
