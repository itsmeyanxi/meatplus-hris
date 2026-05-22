<?php

namespace App\Http\Controllers\Api\V1\Leave;

use App\Domain\Leave\Models\LeaveType;
use App\Http\Controllers\Controller;
use App\Http\Resources\Leave\LeaveTypeResource;
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
}
