<?php

namespace App\Domain\Attendance\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A biometric punch whose device ID (PIN) did not map to any employee at ingest
 * time. Kept so it can be reclaimed into a real TimeLog once the mapping exists.
 */
class UnmatchedPunch extends Model
{
    protected $fillable = [
        'company_id', 'device_key', 'pin', 'logged_at',
        'status', 'verify', 'raw', 'source', 'source_event_id', 'reclaimed_at',
    ];

    protected function casts(): array
    {
        return [
            'logged_at' => 'datetime',
            'reclaimed_at' => 'datetime',
        ];
    }
}
