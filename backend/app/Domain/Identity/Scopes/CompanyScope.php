<?php

namespace App\Domain\Identity\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class CompanyScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (! auth()->check()) {
            return;
        }

        $user = auth()->user();

        // IT admin is the top-level administrator and sees across every company,
        // regardless of which one is active (global, team-independent check).
        if (method_exists($user, 'isItAdmin') ? $user->isItAdmin() : $user->hasRole('it_admin')) {
            return;
        }

        if ($user->active_company_id) {
            $builder->where($model->getTable().'.company_id', $user->active_company_id);
        }
    }
}
