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
