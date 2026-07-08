<?php

namespace App\Http\Controllers\Api\V1\Leave;

use App\Domain\Leave\Models\LeaveApplication;
use App\Domain\Leave\Models\LeaveType;
use App\Http\Controllers\Controller;
use App\Http\Resources\Leave\LeaveTypeResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class LeaveTypeController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        // Any authenticated user can list leave types — needed for the file form dropdown.
        return LeaveTypeResource::collection(
            LeaveType::query()->where('is_active', true)->orderBy('name')->get(),
        );
    }

    public function store(Request $request): LeaveTypeResource
    {
        abort_unless($request->user()->can('leave.manage_types'), 403);

        $validated = $request->validate([
            'code'                    => 'required|string|max:20|unique:leave_types,code',
            'name'                    => 'required|string|max:100',
            'default_credits_per_year'=> 'required|numeric|min:0',
            'is_paid'                 => 'required|boolean',
            'requires_attachment'     => 'required|boolean',
            'accrual_method'          => 'sometimes|string|in:none,monthly,annual',
            'gender_restriction'      => 'nullable|in:male,female',
            'max_consecutive_days'    => 'nullable|integer|min:1',
        ]);

        $type = LeaveType::create(array_merge($validated, [
            'company_id' => $request->user()->company_id,
            'is_active'  => true,
        ]));

        return new LeaveTypeResource($type);
    }

    public function update(Request $request, LeaveType $leaveType): LeaveTypeResource
    {
        abort_unless($request->user()->can('leave.manage_types'), 403);

        $validated = $request->validate([
            'code'                    => 'required|string|max:20|unique:leave_types,code,' . $leaveType->id,
            'name'                    => 'required|string|max:100',
            'default_credits_per_year'=> 'required|numeric|min:0',
            'is_paid'                 => 'required|boolean',
            'requires_attachment'     => 'required|boolean',
            'accrual_method'          => 'sometimes|string|in:none,monthly,annual',
            'gender_restriction'      => 'nullable|in:male,female',
            'max_consecutive_days'    => 'nullable|integer|min:1',
        ]);

        $leaveType->update($validated);

        return new LeaveTypeResource($leaveType->fresh());
    }

    public function destroy(Request $request, LeaveType $leaveType): JsonResponse
    {
        abort_unless($request->user()->can('leave.manage_types'), 403);

        $inUse = LeaveApplication::where('leave_type_id', $leaveType->id)->exists();
        if ($inUse) {
            return response()->json([
                'message' => 'This leave type cannot be deleted because it has existing applications.',
            ], 422);
        }

        $leaveType->delete();

        return response()->json(['message' => 'Leave type deleted.']);
    }
}
