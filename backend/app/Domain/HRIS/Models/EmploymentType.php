<?php

namespace App\Domain\HRIS\Models;

use App\Domain\Identity\Models\Company;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmploymentType extends Model
{
    protected $fillable = ['company_id', 'code', 'name', 'is_regular', 'is_active'];

    protected function casts(): array
    {
        return [
            'is_regular' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
