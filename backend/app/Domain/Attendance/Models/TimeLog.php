<?php

namespace App\Domain\Attendance\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TimeLog extends Model
{
    use BelongsToCompany;

    public $timestamps = false; // append-only — no updated_at

    protected $fillable = [
        'company_id', 'employee_id', 'logged_at', 'direction', 'source',
        'device_id', 'ip_address', 'lat', 'lng', 'metadata',
    ];

    protected function casts(): array
    {
        return [
            'logged_at' => 'datetime',
            'metadata' => 'array',
            'lat' => 'decimal:7',
            'lng' => 'decimal:7',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
