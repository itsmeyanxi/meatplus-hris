<?php

namespace App\Domain\AccessControl\Models;

use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class AccessRequest extends Model
{
    use BelongsToCompany;
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'requested_by_user_id',
        'request_type', 'effective_date', 'ticket_number',
        'employee_name', 'employee_id_number', 'position', 'department',
        'employment_status', 'immediate_supervisor', 'company_email', 'contact_number',
        'justification',
        'status', 'current_stage', 'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'effective_date' => 'date',
            'submitted_at' => 'datetime',
        ];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function modules(): HasMany
    {
        return $this->hasMany(AccessRequestModule::class);
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(AccessRequestApproval::class)->orderBy('sequence');
    }
}
