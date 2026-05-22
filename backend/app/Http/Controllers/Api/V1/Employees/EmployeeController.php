<?php

namespace App\Http\Controllers\Api\V1\Employees;

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
                    ->orWhere('email_company', 'like', $like);
            });
        }

        if ($request->boolean('only_active', false)) {
            $query->where('is_active', true);
        }

        $employees = $query->orderBy('last_name')->orderBy('first_name')
            ->paginate($request->integer('per_page', 25));

        return EmployeeListResource::collection($employees);
    }

    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $employee = Employee::create($request->validated());

        return (new EmployeeResource($employee->load([
            'branch', 'department', 'position', 'employmentType',
        ])))->response()->setStatusCode(201);
    }

    public function show(Request $request, Employee $employee): EmployeeResource
    {
        abort_unless($request->user()->can('employee.view'), 403);

        $employee->load([
            'branch', 'department', 'position', 'employmentType', 'manager',
        ]);

        return new EmployeeResource($employee);
    }

    public function update(UpdateEmployeeRequest $request, Employee $employee): EmployeeResource
    {
        $employee->update($request->validated());
        $employee->load(['branch', 'department', 'position', 'employmentType', 'manager']);

        return new EmployeeResource($employee);
    }

    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.delete'), 403);

        $employee->delete();

        return response()->json(['message' => 'Employee archived.']);
    }
}
