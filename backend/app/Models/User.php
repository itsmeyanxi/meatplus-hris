<?php

namespace App\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Models\Company;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens;
    use HasFactory;
    use HasRoles;
    use LogsActivity;
    use Notifiable;
    use SoftDeletes;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'email', 'username', 'is_active', 'active_company_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('user');
    }

    protected $fillable = [
        'name',
        'email',
        'username',
        'password',
        'active_company_id',
        'original_company_id',
        'is_active',
        'must_change_password',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
            'password' => 'hashed',
        ];
    }

    /**
     * "Online now" — the user has been active within the last few minutes
     * (see TrackUserActivity, which heartbeats last_seen_at on each request).
     */
    public function getIsOnlineAttribute(): bool
    {
        return $this->last_seen_at !== null
            && $this->last_seen_at->diffInMinutes(now()) < 5;
    }

    public function activeCompany(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'active_company_id');
    }

    public function originalCompany(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'original_company_id');
    }

    /** True when the user is still in the company they started in (never switched away). */
    public function isAtHomeCompany(): bool
    {
        return $this->original_company_id === null
            || $this->active_company_id === $this->original_company_id;
    }

    /** Cached per-instance result of the global it_admin check. */
    protected ?bool $itAdminResolved = null;

    protected ?bool $superAdminResolved = null;

    /**
     * True if the user is an IT Admin in ANY company. This is intentionally global
     * and team-independent: it_admin bypasses permission checks (Gate::before) so
     * they can perform any action — but ONLY within their active company. Unlike
     * super_admin, it_admin does NOT bypass the company scope; they still view one
     * company at a time (see CompanyScope). super_admin is the top tier
     * (super_admin > admin > it_admin).
     */
    public function isItAdmin(): bool
    {
        return $this->itAdminResolved ??= \Illuminate\Support\Facades\DB::table('model_has_roles')
            ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
            ->where('model_has_roles.model_id', $this->id)
            ->where('model_has_roles.model_type', $this->getMorphClass())
            ->where('roles.name', 'it_admin')
            ->exists();
    }

    /**
     * The `super_admin` super-role: the single most powerful role, sitting at the top
     * of the admin hierarchy (super_admin > admin > it_admin). It bypasses BOTH the
     * ability checks (Gate::before) AND the company scope (CompanyScope), so it sees
     * every company's data at once with no active-company limitation — unlike
     * `admin` (company-level, one company) and it_admin (IT within one company).
     */
    public function isSuperAdmin(): bool
    {
        return $this->superAdminResolved ??= \Illuminate\Support\Facades\DB::table('model_has_roles')
            ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
            ->where('model_has_roles.model_id', $this->id)
            ->where('model_has_roles.model_type', $this->getMorphClass())
            ->where('roles.name', 'super_admin')
            ->exists();
    }

    public function companies(): BelongsToMany
    {
        return $this->belongsToMany(Company::class, 'company_user')
            ->withPivot('is_default')
            ->withTimestamps();
    }

    public function employee(): HasOne
    {
        return $this->hasOne(Employee::class);
    }

    /** Memoised, company-agnostic employee record for this request. */
    private ?Employee $employeeRecordCache = null;

    private bool $employeeRecordLoaded = false;

    /**
     * The user's OWN employee record, resolved WITHOUT the company scope. A user
     * has a single employee identity in their home company; it must not vanish
     * when they switch to another company they belong to — otherwise a
     * cross-company supervisor/approver stops matching their own reports.
     */
    public function employeeRecord(): ?Employee
    {
        if (! $this->employeeRecordLoaded) {
            $this->employeeRecordCache = Employee::withoutGlobalScopes()->where('user_id', $this->id)->first();
            $this->employeeRecordLoaded = true;
        }

        return $this->employeeRecordCache;
    }

    public function sendPasswordResetNotification($token): void
    {
        $url = config('app.frontend_url') . '/reset-password?token=' . $token . '&email=' . urlencode($this->email ?? '');
        \Illuminate\Support\Facades\Mail::to($this->email)->send(
            new \App\Mail\PasswordResetMail($this->name, $url)
        );
    }
}
