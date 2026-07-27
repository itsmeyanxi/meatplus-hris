<?php

namespace App\Domain\Payroll\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A recurring, amortized deduction (SSS/Pag-IBIG loan, cash advance, company
 * loan). PayrollComputer deducts min(amortization, outstanding_balance) each
 * cutoff; posting a run draws that amount off the balance so it's counted once.
 */
class EmployeeLoan extends Model
{
    use BelongsToCompany;
    use LogsActivity;

    protected $fillable = [
        'company_id', 'employee_id', 'type', 'reference_no',
        'principal', 'amortization', 'outstanding_balance',
        'start_date', 'is_active', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'principal' => 'decimal:2',
            'amortization' => 'decimal:2',
            'outstanding_balance' => 'decimal:2',
            'start_date' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['type', 'amortization', 'outstanding_balance', 'is_active'])
            ->logOnlyDirty();
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** Whether this loan is still deducting (active and with a balance owing). */
    public function isDeductible(): bool
    {
        return $this->is_active && (float) $this->outstanding_balance > 0 && (float) $this->amortization > 0;
    }
}
