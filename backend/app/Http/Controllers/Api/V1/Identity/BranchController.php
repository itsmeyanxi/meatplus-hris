<?php

namespace App\Http\Controllers\Api\V1\Identity;

use App\Domain\Identity\Models\Branch;
use App\Http\Controllers\Controller;
use App\Http\Requests\Identity\UpdateBranchGeofenceRequest;
use App\Http\Resources\Identity\BranchGeofenceResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Branch geofence administration — lets admins set each worksite's GPS pin and
 * the allowed radius that web check-ins are measured against. Query scoping to
 * the active company is handled by the Branch CompanyScope.
 */
class BranchController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('company.manage'), 403);

        return BranchGeofenceResource::collection(
            Branch::query()->orderByDesc('is_head_office')->orderBy('name')->get()
        );
    }

    public function update(UpdateBranchGeofenceRequest $request, Branch $branch): BranchGeofenceResource
    {
        $branch->update($request->validated());

        return new BranchGeofenceResource($branch->refresh());
    }
}
