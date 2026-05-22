<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class EmployeeGovernmentId extends Model
{
    protected $fillable = [
        'employee_id', 'tin', 'sss_no', 'philhealth_no', 'pagibig_no',
        'prc_no', 'prc_expiry',
    ];

    protected function casts(): array
    {
        return [
            'prc_expiry' => 'date',
        ];
    }

    protected function tin(): Attribute
    {
        return $this->encryptedAttribute();
    }

    protected function sssNo(): Attribute
    {
        return $this->encryptedAttribute();
    }

    protected function philhealthNo(): Attribute
    {
        return $this->encryptedAttribute();
    }

    protected function pagibigNo(): Attribute
    {
        return $this->encryptedAttribute();
    }

    private function encryptedAttribute(): Attribute
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
