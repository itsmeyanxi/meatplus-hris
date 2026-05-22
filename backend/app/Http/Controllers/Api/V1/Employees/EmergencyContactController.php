<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeEmergencyContact;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\EmergencyContactRequest;
use App\Http\Resources\Employees\EmergencyContactResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class EmergencyContactController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return EmergencyContactResource::collection(
            $employee->emergencyContacts()->orderBy('name')->get(),
        );
    }

    public function store(EmergencyContactRequest $request, Employee $employee): JsonResponse
    {
        $contact = $employee->emergencyContacts()->create($request->validated());

        return (new EmergencyContactResource($contact))->response()->setStatusCode(201);
    }

    public function show(Request $request, Employee $employee, EmployeeEmergencyContact $emergencyContact): EmergencyContactResource
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return new EmergencyContactResource($emergencyContact);
    }

    public function update(EmergencyContactRequest $request, Employee $employee, EmployeeEmergencyContact $emergencyContact): EmergencyContactResource
    {
        $emergencyContact->update($request->validated());

        return new EmergencyContactResource($emergencyContact);
    }

    public function destroy(Request $request, Employee $employee, EmployeeEmergencyContact $emergencyContact): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $emergencyContact->delete();

        return response()->json(['message' => 'Emergency contact removed.']);
    }
}
