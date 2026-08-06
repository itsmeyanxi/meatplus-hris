<?php

namespace App\Domain\Payroll\Models;

use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Spatie\Activitylog\Contracts\Activity as ActivityContract;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class PayrollRun extends Model
{
    use BelongsToCompany;
    use LogsActivity;

    /** Set transiently before delete() so the audit log records WHY it was deleted. */
    public ?string $deleteReason = null;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'status', 'period_start', 'period_end', 'pay_date', 'pay_group'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->useLogName('payroll');
    }

    /**
     * Enrich the auto delete-log with the mandatory reason + a readable snapshot,
     * so the audit trail shows who deleted which run and why.
     */
    public function tapActivity(ActivityContract $activity, string $eventName): void
    {
        if ($eventName !== 'deleted') {
            return;
        }
        $props = $activity->properties ?? collect();
        $activity->properties = $props->merge([
            'reason' => $this->deleteReason,
            'run' => [
                'name' => $this->name,
                'period' => optional($this->period_start)->toDateString().' → '.optional($this->period_end)->toDateString(),
                'pay_date' => optional($this->pay_date)->toDateString(),
                'status' => $this->status,
            ],
        ]);
        $activity->description = "Deleted payroll run '{$this->name}'".($this->deleteReason ? " — reason: {$this->deleteReason}" : '');
    }

    protected $fillable = [
        'company_id', 'name', 'pay_group', 'period_start', 'period_end', 'pay_date',
        'status', 'notes', 'created_by_user_id',
        'computed_at', 'approved_at', 'posted_at',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'pay_date' => 'date',
            'computed_at' => 'datetime',
            'approved_at' => 'datetime',
            'posted_at' => 'datetime',
        ];
    }

    public function payslips(): HasMany
    {
        return $this->hasMany(Payslip::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
