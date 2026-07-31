<?php

namespace App\Http\Controllers\Api\V1\Lookups;

use App\Domain\HRIS\Models\Department;
use App\Domain\HRIS\Models\EmploymentType;
use App\Domain\HRIS\Models\Position;
use App\Domain\Identity\Models\Branch;
use App\Domain\Identity\Models\Company;
use App\Domain\Identity\Scopes\CompanyScope;
use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LookupController extends Controller
{
    /** Companies the user may read from: all of them for it_admin, else their own. */
    private function allowedCompanyIds(Request $request): array
    {
        $user = $request->user();

        return $user->hasRole('it_admin')
            ? Company::query()->pluck('id')->all()
            : $user->companies()->pluck('companies.id')->all();
    }

    /**
     * Registration lets an authorised user pick a company other than their active
     * one, so these lookups accept ?company_id=. The global CompanyScope pins every
     * query to the active company, so it is lifted and replaced with an explicit
     * filter — but only for a company the user actually belongs to. Without that
     * membership check this would be a tenancy hole.
     */
    private function scopeToCompany(Builder $query, Request $request): Builder
    {
        $requested = (int) $request->query('company_id');
        if ($requested) {
            abort_unless(
                in_array($requested, $this->allowedCompanyIds($request), true),
                403,
                'You do not belong to that company.',
            );

            return $query->withoutGlobalScope(CompanyScope::class)->where('company_id', $requested);
        }

        // No explicit company: a lookup should always reflect the ONE company the
        // user is currently in. For most users the global CompanyScope already does
        // that, but the `admin` super-role bypasses CompanyScope (see CompanyScope),
        // which would otherwise leak every company's branches/departments/etc into
        // these lists. Pin to the active company explicitly so super-admins are
        // scoped here too; they can still switch companies to see another.
        $user = $request->user();
        if ($user->active_company_id) {
            return $query
                ->withoutGlobalScope(CompanyScope::class)
                ->where($query->getModel()->getTable().'.company_id', $user->active_company_id);
        }

        return $query;
    }

    public function companies(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Company::query()->orderBy('legal_name');

        // IT admin sees every company; everyone else only the ones they belong to.
        if (! $user->hasRole('it_admin')) {
            $query->whereIn('id', $user->companies()->pluck('companies.id'));
        }

        return response()->json([
            'data' => $query->get(['id', 'code', 'legal_name', 'trade_name'])->map(fn ($c) => [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->trade_name ?: $c->legal_name,
            ]),
        ]);
    }

    public function branches(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->scopeToCompany(Branch::query(), $request)
                ->where('is_active', true)
                ->withCount(['employees' => fn ($q) => $q->where('is_active', true)])
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'is_head_office', 'is_agency', 'latitude', 'longitude']),
        ]);
    }

    public function departments(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->scopeToCompany(Department::query(), $request)
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'parent_department_id']),
        ]);
    }

    public function positions(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->scopeToCompany(Position::query(), $request)
                ->where('is_active', true)
                ->when($request->query('department_id'), fn ($q, $d) => $q->where('department_id', $d))
                ->orderBy('title')
                ->get(['id', 'department_id', 'title', 'level']),
        ]);
    }

    public function employmentTypes(Request $request): JsonResponse
    {
        // EmploymentType is not company-scoped: rows are either global or company-specific.
        $requested = (int) $request->query('company_id');
        if ($requested) {
            abort_unless(
                in_array($requested, $this->allowedCompanyIds($request), true),
                403,
                'You do not belong to that company.',
            );
        }
        $companyId = $requested ?: $request->user()->active_company_id;

        return response()->json([
            'data' => EmploymentType::query()
                ->where('is_active', true)
                ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $companyId))
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'is_regular']),
        ]);
    }
}
