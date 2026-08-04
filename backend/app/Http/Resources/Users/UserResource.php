<?php

namespace App\Http\Resources\Users;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'is_active' => $this->is_active,
            'last_login_at' => $this->last_login_at,
            'last_seen_at' => $this->last_seen_at,
            'is_online' => $this->is_online,
            'employee' => $this->whenLoaded('employee', fn () => $this->employee ? [
                'id' => $this->employee->id,
                'employee_no' => $this->employee->employee_no,
                'full_name' => $this->employee->full_name,
                'position' => $this->employee->relationLoaded('position') ? $this->employee->position?->title : null,
            ] : null),
            // A hint (from the linked employee's job title) HR can one-click apply
            // when assigning access. Never auto-assigned; sensitive roles excluded.
            'suggested_role' => $this->whenLoaded('employee', fn () => $this->employee
                ? app(\App\Domain\Identity\Services\RoleSuggester::class)->suggest($this->employee)
                : null),
            'roles' => $this->getRoleNames(),
            // Companies this user can access/switch between (multi-company HR staff).
            'companies' => $this->whenLoaded('companies', fn () => $this->companies->map(fn ($c) => [
                'id' => $c->id, 'code' => $c->code, 'legal_name' => $c->legal_name,
            ])->values()),
            // The user's "home" company — used to group the Users list. Prefer the
            // linked employee's company (where they actually belong) over the active
            // company, which for multi-company admins is just wherever they last
            // switched. Falls back to the active company for direct (non-employee) users.
            'primary_company' => $this->resolvePrimaryCompany(),
            'created_at' => $this->created_at,
        ];
    }

    /** Employee's company if linked, else the active company. Null if neither loaded. */
    private function resolvePrimaryCompany(): ?array
    {
        $company = null;
        if ($this->relationLoaded('employee') && $this->employee && $this->employee->relationLoaded('company')) {
            $company = $this->employee->company;
        }
        if (! $company && $this->relationLoaded('activeCompany')) {
            $company = $this->activeCompany;
        }

        return $company ? [
            'id' => $company->id,
            'code' => $company->code,
            'legal_name' => $company->legal_name,
        ] : null;
    }
}
