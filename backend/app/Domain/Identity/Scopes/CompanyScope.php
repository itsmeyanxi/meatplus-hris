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

        // The `admin` super-role sees EVERY company's data at once — no active-company
        // limitation. This is the one deliberate hole in tenant isolation.
        if (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return;
        }

        // Everyone else — including it_admin — sees ONLY the company they are currently
        // in. it_admin's elevated power is over what they may *do* (see Gate::before in
        // AppServiceProvider), NOT over what data they see: they still view one company
        // at a time and switch companies to see another. This keeps each company's data
        // fully isolated to that company's context.
        if ($user->active_company_id) {
            $builder->where($model->getTable().'.company_id', $user->active_company_id);
        } else {
            // No active company → fail CLOSED, never open. Without this the scope
            // would apply no filter and leak every tenant's rows.
            $builder->whereRaw('1 = 0');
        }
    }
}
