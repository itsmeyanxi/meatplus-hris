<?php

namespace App\Http\Controllers\Api\V1\Lookups;

use App\Domain\HRIS\Models\Department;
use App\Domain\HRIS\Models\EmploymentType;
use App\Domain\HRIS\Models\Position;
use App\Domain\Identity\Models\Branch;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LookupController extends Controller
{
    public function branches(Request $request): JsonResponse
    {
        return response()->json([
            'data' => Branch::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'is_head_office']),
        ]);
    }

    public function departments(Request $request): JsonResponse
    {
        return response()->json([
            'data' => Department::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'parent_department_id']),
        ]);
    }

    public function positions(Request $request): JsonResponse
    {
        return response()->json([
            'data' => Position::query()
                ->where('is_active', true)
                ->when($request->query('department_id'), fn ($q, $d) => $q->where('department_id', $d))
                ->orderBy('title')
                ->get(['id', 'department_id', 'title', 'level']),
        ]);
    }

    public function employmentTypes(Request $request): JsonResponse
    {
        $companyId = $request->user()->active_company_id;

        return response()->json([
            'data' => EmploymentType::query()
                ->where('is_active', true)
                ->where(fn ($q) => $q->whereNull('company_id')->orWhere('company_id', $companyId))
                ->orderBy('name')
                ->get(['id', 'code', 'name', 'is_regular']),
        ]);
    }
}
