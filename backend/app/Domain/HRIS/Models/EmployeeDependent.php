<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeDependent extends Model
{
    protected $fillable = [
        'employee_id', 'full_name', 'relationship', 'birth_date',
        'is_minor', 'is_pwd', 'is_qualified_for_tax_exemption',
    ];

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
