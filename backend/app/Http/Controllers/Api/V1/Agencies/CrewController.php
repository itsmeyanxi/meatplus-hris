<?php

namespace App\Http\Controllers\Api\V1\Agencies;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Project Crews — internal project-based crews (BLAST, BASIC CREW, WAREHOUSE,
 * JANITORIAL, ICE, CUTTER for PASEI), separated from organic employees and shown
 * on their own attendance board. Same behaviour as the Agency module, but keyed
 * on branches tagged is_project_crew instead of is_agency (and no fall-back to
 * all branches — a company either has crews or it doesn't).
 */
class CrewController extends AgencyController
{
    protected function branchFlag(): string
    {
        return 'is_project_crew';
    }

    protected function fallbackToAllBranches(): bool
    {
        return false;
    }

    /**
     * POST /api/v1/crews/{branch}/assign — move EXISTING employees into this crew
     * (sets their branch to the crew). Lets HR pull already-registered workers into
     * a crew instead of re-typing them; works whether they were organic or agency.
     */
    public function assignExisting(Request $request, int $branch): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->canAny(['employee.update', 'employee.create']), 403);

        $b = Branch::query()->find($branch);
        abort_unless($b && (int) $b->company_id === (int) $user->active_company_id, 404, 'Crew not found.');

        $data = $request->validate([
            'employee_ids' => ['required', 'array', 'min:1'],
            'employee_ids.*' => ['integer'],
        ]);

        // Scope-agnostic: an employee joining a crew may currently be organic or in
        // an agency, so bypass the company scope but pin to THIS company for safety.
        $employees = Employee::withoutGlobalScopes()
            ->where('company_id', $b->company_id)
            ->whereIn('id', $data['employee_ids'])
            ->get(['id', 'first_name', 'last_name', 'branch_id']);

        foreach ($employees as $e) {
            $e->forceFill(['branch_id' => $b->id])->save();
        }

        return response()->json([
            'assigned' => $employees->count(),
            'message' => $employees->count().' worker(s) added to '.$b->name.'.',
        ]);
    }
}
