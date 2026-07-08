<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\GovernmentIdRequest;
use App\Http\Resources\Employees\GovernmentIdResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GovernmentIdController extends Controller
{
    public function show(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.view'), 403);

        $record = $employee->governmentIds;

        if (! $record) {
            return response()->json(['data' => null]);
        }

        return (new GovernmentIdResource($record))->response();
    }

    public function upsert(GovernmentIdRequest $request, Employee $employee): JsonResponse
    {
        $record = $employee->governmentIds()->firstOrNew([]);
        $record->fill($request->validated());
        $record->save();

        return (new GovernmentIdResource($record))->response();
    }
}
