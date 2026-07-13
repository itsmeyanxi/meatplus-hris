<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeAsset;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\AssetRequest;
use App\Http\Resources\Employees\AssetResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class EmployeeAssetController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return AssetResource::collection(
            $employee->assets()->orderByDesc('acquired_date')->orderByDesc('id')->get(),
        );
    }

    public function store(AssetRequest $request, Employee $employee): JsonResponse
    {
        $asset = $employee->assets()->create($request->validated());

        return (new AssetResource($asset))->response()->setStatusCode(201);
    }

    public function update(AssetRequest $request, Employee $employee, EmployeeAsset $asset): AssetResource
    {
        $asset->update($request->validated());

        return new AssetResource($asset);
    }

    public function destroy(Request $request, Employee $employee, EmployeeAsset $asset): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $asset->delete();

        return response()->json(['message' => 'Asset removed.']);
    }
}
