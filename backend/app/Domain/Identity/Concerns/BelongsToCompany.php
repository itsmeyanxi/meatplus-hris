<?php

namespace App\Domain\Identity\Concerns;

use App\Domain\Identity\Models\Company;
use App\Domain\Identity\Scopes\CompanyScope;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait BelongsToCompany
{
    public static function bootBelongsToCompany(): void
    {
        static::addGlobalScope(new CompanyScope);

        static::creating(function ($model) {
            if (! $model->company_id && auth()->check() && auth()->user()->active_company_id) {
                $model->company_id = auth()->user()->active_company_id;
            }
        });
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
