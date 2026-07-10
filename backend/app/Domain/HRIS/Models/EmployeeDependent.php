<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeDependent extends Model
{
    protected $fillable = [
        'employee_id', 'first_name', 'middle_name', 'last_name', 'full_name',
        'relationship', 'birth_date', 'gender',
        'is_minor', 'is_pwd', 'is_qualified_for_tax_exemption', 'notes',
    ];

    /**
     * full_name is what tax-exemption and BIR reporting read. Keep it in step with
     * the name parts rather than letting the two drift.
     */
    protected static function booted(): void
    {
        static::saving(function (self $dependent) {
            $parts = array_filter([
                $dependent->first_name,
                $dependent->middle_name,
                $dependent->last_name,
            ]);

            if ($parts) {
                $dependent->full_name = implode(' ', $parts);
            }
        });
    }

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'is_minor' => 'boolean',
            'is_pwd' => 'boolean',
            'is_qualified_for_tax_exemption' => 'boolean',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
