<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\StoreEmployeeRequest;
use App\Http\Requests\Employees\UpdateEmployeeRequest;
use App\Http\Resources\Employees\EmployeeListResource;
use App\Http\Resources\Employees\EmployeeResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class EmployeeController extends Controller
{
    /**
     * Display a listing of the employees.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        $query = Employee::query()
            ->with(['department:id,name', 'position:id,title', 'employmentType:id,name']);

        if ($search = $request->query('q')) {
            $like = '%'.str_replace('%', '\%', $search).'%';
            $query->where(function ($q) use ($like) {
                $q->where('employee_no', 'like', $like)
                    ->orWhere('first_name', 'like', $like)
                    ->orWhere('last_name', 'like', $like)
                    ->orWhere('email_company', 'like', $like)
                    ->orWhereHas('department', function ($departmentQuery) use ($like) {
                        $departmentQuery->where('name', 'like', $like);
                    });
            });
        }

        if ($request->boolean('only_active', false)) {
            $query->where('is_active', true);
        }

        $employees = $query->orderBy('last_name')->orderBy('first_name')
            ->paginate($request->integer('per_page', 25));

        return EmployeeListResource::collection($employees);
    }

    /**
     * Store a newly created employee in storage.
     */
    public function store(StoreEmployeeRequest $request, DtrComputer $computer): JsonResponse
    {
        $employee = Employee::create($request->validated());

        // Seed the new hire's calendar with existing holidays.
        $computer->applyHolidaysToEmployee($employee);

        return (new EmployeeResource($employee->load([
            'branch', 'department', 'position', 'employmentType',
        ])))->response()->setStatusCode(201);
    }

    /**
     * Display the specified employee profile.
     */
    public function show(Request $request, Employee $employee): EmployeeResource
    {
        abort_unless($request->user()->can('employee.view'), 403);

        $employee->load([
            'branch', 'department', 'position', 'employmentType', 'manager',
        ]);

        return new EmployeeResource($employee);
    }

    /**
     * Update the specified employee in storage.
     */
    public function update(UpdateEmployeeRequest $request, Employee $employee): EmployeeResource
    {
        abort_unless($request->user()->can('employee.update'), 403);

        // 1. Validates the incoming Next.js payload values against UpdateEmployeeRequest rules
        // 2. Mass-updates the matching columns in your MySQL database table safely
        $employee->update($request->validated());
        
        // 3. Eager-loads relationships back up so your frontend dashboard re-renders with fresh metadata
        $employee->load(['branch', 'department', 'position', 'employmentType', 'manager']);

        // 4. Returns the updated data model wrapped cleanly inside your JSON API collection
        return new EmployeeResource($employee);
    }

    /**
     * Remove (archive) the specified employee from storage.
     */
    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.delete'), 403);

        $employee->delete();

        return response()->json(['message' => 'Employee archived.']);
    }
}