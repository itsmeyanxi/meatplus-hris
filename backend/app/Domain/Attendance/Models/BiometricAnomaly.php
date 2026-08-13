<?php

namespace App\Domain\Attendance\Models;

use App\Domain\HRIS\Models\Employee;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A detected biometric-mapping problem (see the migration). Deliberately NOT under
 * the company global scope: it is an admin/HR diagnostic surfaced cross-company.
 */
class BiometricAnomaly extends Model
{
    protected $fillable = [
        'company_id', 'employee_id', 'pin', 'device_key', 'kind',
        'device_name', 'punches', 'detail', 'detected_at', 'notified_at', 'resolved_at',
    ];

    protected $casts = [
        'detected_at' => 'datetime',
        'notified_at' => 'datetime',
        'resolved_at' => 'datetime',
        'punches' => 'integer',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
