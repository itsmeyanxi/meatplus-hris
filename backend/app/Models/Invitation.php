<?php

namespace App\Models;

use App\Domain\HRIS\Models\Employee;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Invitation extends Model
{
    protected $fillable = ['employee_id', 'email', 'token', 'accepted_at', 'expires_at'];

    protected function casts(): array
    {
        return [
            'accepted_at' => 'datetime',
            'expires_at'  => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isAccepted(): bool
    {
        return $this->accepted_at !== null;
    }
}
