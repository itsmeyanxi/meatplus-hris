<?php

namespace App\Domain\Identity\Support;

use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Resolve which users to notify for a company-scoped HR alert.
 *
 * Roles are assigned per company (spatie teams; model_has_roles.company_id). So HR
 * of company A must not be pinged about company B's employees. This returns the
 * active users who hold {@param $permission} FOR the given company — plus anyone
 * holding it globally (a null-company assignment, e.g. super_admin / it_admin who
 * oversee every company). Passing a null company falls back to all holders.
 */
class HrRecipients
{
    /** @return Collection<int, User> */
    public static function withPermissionForCompany(string $permission, ?int $companyId): Collection
    {
        $roleIds = DB::table('role_has_permissions as rp')
            ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
            ->where('p.name', $permission)
            ->pluck('rp.role_id');

        if ($roleIds->isEmpty()) {
            return collect();
        }

        $userIds = DB::table('model_has_roles')
            ->where('model_type', User::class)
            ->whereIn('role_id', $roleIds)
            ->when($companyId, fn ($q) => $q->where(function ($w) use ($companyId) {
                $w->where('company_id', $companyId)   // HR of this company
                    ->orWhereNull('company_id');       // + globally-assigned admins
            }))
            ->pluck('model_id')
            ->unique();

        return User::whereIn('id', $userIds)->where('is_active', true)->get();
    }
}
