<?php

namespace App\Http\Controllers\Api\V1\Me;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in user's team — their direct reports. This is the department
 * head / supervisor view; returns an empty list for accounts that manage no one.
 */
class TeamController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;

        if (! $employee) {
            return response()->json(['data' => []]);
        }

        $reports = $employee->directReports()
            ->with(['position:id,title', 'department:id,name'])
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get()
            ->map(fn ($e) => [
                'id' => $e->id,
                'employee_no' => $e->employee_no,
                'full_name' => trim(($e->first_name ?? '') . ' ' . ($e->last_name ?? '')),
                'position' => $e->position?->title,
                'department' => $e->department?->name,
                'is_active' => $e->is_active,
            ]);

        return response()->json(['data' => $reports]);
    }
}
