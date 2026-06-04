<?php

namespace App\Domain\AccessControl\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccessRequestApproval extends Model
{
    protected $fillable = [
        'access_request_id', 'stage', 'sequence',
        'status', 'decided_by_user_id', 'decided_at', 'remarks',
    ];

    protected function casts(): array
    {
        return [
            'decided_at' => 'datetime',
        ];
    }

    public function accessRequest(): BelongsTo
    {
        return $this->belongsTo(AccessRequest::class);
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by_user_id');
    }
}
