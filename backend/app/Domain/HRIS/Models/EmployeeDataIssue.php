<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A detected employee-data problem (see the migration). Not company-scoped: it is
 * an admin/HR diagnostic; the controller applies company scoping for listing.
 */
class EmployeeDataIssue extends Model
{
    protected $fillable = [
        'company_id', 'employee_id', 'category', 'severity', 'detail',
        'detected_at', 'resolved_at', 'ignored', 'first_notified_at',
    ];

    protected $casts = [
        'detected_at' => 'datetime',
        'resolved_at' => 'datetime',
        'first_notified_at' => 'datetime',
        'ignored' => 'boolean',
    ];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
