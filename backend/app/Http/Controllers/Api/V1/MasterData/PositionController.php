<?php

namespace App\Http\Controllers\Api\V1\MasterData;

use App\Domain\HRIS\Models\Position;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PositionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $companyId = $request->user()->active_company_id;

        $q = Position::query()
            ->where('company_id', $companyId)
            ->orderBy('title');

        if ($deptId = $request->query('department_id')) {
            $q->where('department_id', $deptId);
        }

        return response()->json([
            'data' => $q->get(['id', 'department_id', 'title', 'level', 'is_active']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $companyId = $request->user()->active_company_id;

        $validated = $request->validate([
            'title'         => ['required', 'string', 'max:120'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'level'         => ['nullable', 'integer', 'min:1'],
        ]);

        $position = Position::create([
            'company_id'    => $companyId,
            'title'         => $validated['title'],
            'department_id' => $validated['department_id'] ?? null,
            'level'         => $validated['level'] ?? null,
            'is_active'     => true,
        ]);

        return response()->json(['data' => $position], 201);
    }

    public function update(Request $request, Position $position): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $validated = $request->validate([
            'title'         => ['required', 'string', 'max:120'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'level'         => ['nullable', 'integer', 'min:1'],
        ]);

        $position->update($validated);

        return response()->json(['data' => $position->fresh()]);
    }

    public function destroy(Request $request, Position $position): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $inUse = $position->employees()->exists();
        if ($inUse) {
            return response()->json([
                'message' => 'This position cannot be deleted because it is assigned to employees.',
            ], 422);
        }

        $position->delete();

        return response()->json(['message' => 'Position deleted.']);
    }
}
