<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeLocation;
use App\Domain\Identity\Models\Branch;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use App\Http\Resources\Employees\LocationResource;
use Illuminate\Validation\Rule;

class LocationController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return LocationResource::collection(
            $employee->locations()->with('branch')->orderByDesc('is_primary')->get(),
        );
    }

    public function store(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $data = $request->validate([
            // The branch must belong to the same company as the employee.
            'branch_id' => [
                'required', 'integer',
                Rule::exists('branches', 'id')->where('company_id', $employee->company_id),
                Rule::unique('employee_locations')->where('employee_id', $employee->id),
            ],
            'designated_workplace' => ['nullable', 'string', 'max:150'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);

        $isPrimary = (bool) ($data['is_primary'] ?? $employee->locations()->count() === 0);

        if ($isPrimary) {
            $employee->locations()->update(['is_primary' => false]);
        }

        $location = $employee->locations()->create([
            'branch_id' => $data['branch_id'],
            'designated_workplace' => $data['designated_workplace'] ?? null,
            'is_primary' => $isPrimary,
        ]);

        // employees.branch_id remains the primary worksite; keep it in step.
        if ($isPrimary) {
            $employee->forceFill(['branch_id' => $data['branch_id']])->save();
        }

        return (new LocationResource($location->load('branch')))->response()->setStatusCode(201);
    }

    public function destroy(Request $request, Employee $employee, EmployeeLocation $location): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($location->employee_id === $employee->id, 404);

        $wasPrimary = $location->is_primary;
        $location->delete();

        // Promote the next remaining location so branch_id never dangles.
        if ($wasPrimary && ($next = $employee->locations()->first())) {
            $next->update(['is_primary' => true]);
            $employee->forceFill(['branch_id' => $next->branch_id])->save();
        }

        return response()->json(['message' => 'Location removed.']);
    }
}
