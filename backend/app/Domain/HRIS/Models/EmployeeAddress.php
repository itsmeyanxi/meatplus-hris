<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeAddress extends Model
{
    protected $table = 'employee_addresses';

    protected $fillable = [
        'employee_id', 'label', 'address_line1', 'address_line2',
        'city', 'province', 'postal_code', 'country', 'is_primary',
    ];

    protected function casts(): array
    {
        return ['is_primary' => 'boolean'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
