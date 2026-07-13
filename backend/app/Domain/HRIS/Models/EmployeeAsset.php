<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeAsset extends Model
{
    protected $fillable = [
        'employee_id', 'item', 'category', 'condition', 'purchase_price',
        'serial_number', 'acquired_date', 'date_issued', 'date_returned', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'purchase_price' => 'decimal:2',
            'acquired_date' => 'date',
            'date_issued' => 'date',
            'date_returned' => 'date',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
