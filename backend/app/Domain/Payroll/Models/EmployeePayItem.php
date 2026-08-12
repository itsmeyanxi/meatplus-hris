<?php

namespace App\Domain\Payroll\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An HR-defined recurring pay benefit/allowance for one employee. PayrollComputer
 * pays it each cutoff by its cadence: monthly (halved), per_cutoff (flat), or
 * per_day (× the employee's days of attendance).
 */
class EmployeePayItem extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'employee_id', 'label', 'amount', 'cadence', 'is_active', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    /** @var string[] Valid cadences. */
    public const CADENCES = ['monthly', 'per_cutoff', 'per_day'];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** The amount to pay this cutoff for the given attendance. */
    public function amountForCutoff(int $presentDays): float
    {
        return match ($this->cadence) {
            'per_cutoff' => round((float) $this->amount, 2),
            'per_day' => round((float) $this->amount * $presentDays, 2),
            default => round((float) $this->amount / 2, 2), // monthly
        };
    }
}
