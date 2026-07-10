<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class EmployeeVisa extends Model
{
    protected $table = 'employee_visas';

    protected $fillable = [
        'employee_id', 'visa_type', 'visa_number',
        'issue_date', 'expiration_date', 'place_of_issue', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'issue_date' => 'date',
            'expiration_date' => 'date',
        ];
    }

    /** Encrypted at rest, like passport_no and the government IDs. */
    protected function visaNumber(): Attribute
    {
        return Attribute::make(
            get: fn ($v) => $v ? Crypt::decryptString($v) : null,
            set: fn ($v) => $v ? Crypt::encryptString($v) : null,
        );
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
