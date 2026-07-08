<?php

namespace App\Http\Controllers\Api\V1\MasterData;

use App\Domain\HRIS\Models\Department;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $companyId = $request->user()->active_company_id;

        return response()->json([
            'data' => Department::query()
                ->where('company_id', $companyId)
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'is_active', 'parent_department_id']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $companyId = $request->user()->active_company_id;

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['nullable', 'string', 'max:30'],
        ]);

        $department = Department::create([
            'company_id' => $companyId,
            'name'       => $validated['name'],
            'code'       => $validated['code'] ?? null,
            'is_active'  => true,
        ]);

        return response()->json(['data' => $department], 201);
    }

    public function update(Request $request, Department $department): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['nullable', 'string', 'max:30'],
        ]);

        $department->update($validated);

        return response()->json(['data' => $department->fresh()]);
    }

    public function destroy(Request $request, Department $department): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $inUse = $department->employees()->exists() || $department->positions()->exists();
        if ($inUse) {
            return response()->json([
                'message' => 'This department cannot be deleted because it is referenced by employees or positions.',
            ], 422);
        }

        $department->delete();

        return response()->json(['message' => 'Department deleted.']);
    }
}
