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

        // EVERYONE — including super_admin and admins — sees ONLY the company they are
        // currently in. Cross-company visibility requires explicitly SWITCHING companies;
        // there is no god-view of all tenants at once. A role's elevated power is over
        // what they may *do* (see Gate::before in AppServiceProvider), NOT over what data
        // they see. Each company's data stays isolated to that company's context.
        //
        // The one thing that legitimately spans companies is a user's own NOTIFICATIONS,
        // which are keyed to the user (Laravel's notifications table), not company_id, so
        // they are unaffected by this scope.
        if ($user->active_company_id) {
            $builder->where($model->getTable().'.company_id', $user->active_company_id);
        } else {
            // No active company → fail CLOSED, never open. Without this the scope
            // would apply no filter and leak every tenant's rows.
            $builder->whereRaw('1 = 0');
        }
    }
}
