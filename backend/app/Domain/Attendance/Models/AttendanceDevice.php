<?php

namespace App\Domain\Attendance\Models;

use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Domain\Identity\Models\Branch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

/**
 * A physical attendance terminal (e.g. Hikvision DS-K1T804AMF) the system polls
 * for punch events. Credentials are encrypted at rest via the `password` cast.
 */
class AttendanceDevice extends Model
{
    use BelongsToCompany;
    use LogsActivity;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'serial_no', 'company_id', 'branch_id', 'is_active'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('device');
    }

    protected $fillable = [
        'company_id', 'branch_id', 'name', 'vendor', 'serial_no',
        'ip_address', 'port', 'timezone', 'use_server_time', 'username', 'password', 'is_active',
        'last_synced_at', 'last_event_at', 'last_seen_at',
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
            'last_seen_at' => 'datetime',
        ];
    }

    /**
     * Minutes since the terminal last CONTACTED us at all (not since it last sent a
     * punch). Null when it has never made contact. This is the connectivity signal —
     * `last_event_at` answers a different question: when did someone last punch here.
     */
    public function silentMinutes(): ?int
    {
        $seen = $this->last_seen_at ?? $this->last_event_at;

        return $seen ? (int) $seen->diffInMinutes(now()) : null;
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
