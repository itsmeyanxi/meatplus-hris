<?php

namespace App\Domain\AccessControl\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccessRequestModule extends Model
{
    protected $fillable = [
        'access_request_id', 'module', 'view', 'user', 'approver', 'admin',
    ];

    protected function casts(): array
    {
        return [
            'view' => 'boolean',
            'user' => 'boolean',
            'approver' => 'boolean',
            'admin' => 'boolean',
        ];
    }

    public function accessRequest(): BelongsTo
    {
        return $this->belongsTo(AccessRequest::class);
    }
}
