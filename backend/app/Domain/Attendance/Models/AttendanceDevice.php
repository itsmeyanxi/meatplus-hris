<?php

namespace App\Domain\Attendance\Models;

use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Domain\Identity\Models\Branch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A physical attendance terminal (e.g. Hikvision DS-K1T804AMF) the system polls
 * for punch events. Credentials are encrypted at rest via the `password` cast.
 */
class AttendanceDevice extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'branch_id', 'name', 'vendor', 'serial_no',
        'ip_address', 'port', 'timezone', 'use_server_time', 'username', 'password', 'is_active',
        'last_synced_at', 'last_event_at',
    ];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'password' => 'encrypted',
            'port' => 'integer',
            'use_server_time' => 'boolean',
            'is_active' => 'boolean',
            'last_synced_at' => 'datetime',
            'last_event_at' => 'datetime',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /** Base ISAPI URL, e.g. http://192.168.110.8:80 */
    public function baseUrl(): string
    {
        return "http://{$this->ip_address}:{$this->port}";
    }

    /** The device's effective timezone (falls back to the app timezone). */
    public function tz(): string
    {
        return $this->timezone ?: config('app.timezone');
    }
}
