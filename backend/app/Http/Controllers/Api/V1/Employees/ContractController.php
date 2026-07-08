<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeContract;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\ContractRequest;
use App\Http\Resources\Employees\ContractResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ContractController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return ContractResource::collection(
            $employee->contracts()->with('position')->orderByDesc('effective_from')->get(),
        );
    }

    public function store(ContractRequest $request, Employee $employee): JsonResponse
    {
        $contract = $employee->contracts()->create($request->validated());
        $contract->load('position');

        return (new ContractResource($contract))->response()->setStatusCode(201);
    }

    public function destroy(Request $request, Employee $employee, EmployeeContract $contract): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $contract->delete();

        return response()->json(['message' => 'Contract removed.']);
    }
}
