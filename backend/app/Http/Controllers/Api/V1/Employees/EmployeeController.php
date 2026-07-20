<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\StoreEmployeeRequest;
use App\Http\Requests\Employees\UpdateEmployeeRequest;
use App\Http\Resources\Employees\EmployeeListResource;
use App\Http\Resources\Employees\EmployeeResource;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeController extends Controller
{
    /**
     * Display a listing of the employees.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        $employees = $this->filteredQuery($request)
            ->orderBy('last_name')->orderBy('first_name')
            ->paginate($request->integer('per_page', 25));

        return EmployeeListResource::collection($employees);
    }

    /**
     * Export the (filtered) employee list as a CSV. Columns are import-compatible
     * so an export can be edited and re-imported.
     */
    public function export(Request $request): StreamedResponse
    {
        abort_unless($request->user()->can('employee.view'), 403);

        $rows = $this->filteredQuery($request)->orderBy('last_name')->orderBy('first_name')->get();

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, [
                'Employee ID', 'Last Name', 'Middle Name', 'First Name', 'Gender', 'Civil Status',
                'Department', 'Location', 'Email', 'Position', 'Employment Type', 'Date Hired', 'Birth Date', 'Status',
            ]);
            foreach ($rows as $e) {
                fputcsv($out, [
                    $e->employee_no,
                    $e->last_name,
                    $e->middle_name,
                    $e->first_name,
                    $e->gender,
                    $e->civil_status,
                    $e->department?->name,
                    $e->branch?->name,
                    $e->email_company,
                    $e->position?->title,
                    $e->employmentType?->name,
                    $e->date_hired?->toDateString(),
                    $e->birth_date?->toDateString(),
                    $e->is_active ? 'Active' : 'Inactive',
                ]);
            }
            fclose($out);
        }, 'employees.csv', ['Content-Type' => 'text/csv']);
    }

    /** Build the employee listing query with all supported filters applied. */
    private function filteredQuery(Request $request): Builder
    {
        $query = Employee::query()
            ->with([
                'department:id,name', 'position:id,title', 'employmentType:id,name',
                'company:id,code,legal_name,trade_name', 'branch:id,name', 'user:id',
            ])
            ->withExists([
                'invitations as has_pending_invitation' => fn ($q) => $q
                    ->whereNull('accepted_at')
                    ->where('expires_at', '>', now()),
            ]);

        $op = $this->likeOperator();

        if ($search = $request->query('q')) {
            $like = '%'.str_replace('%', '\%', $search).'%';
            $query->where(function ($q) use ($like, $op) {
                $q->where('employee_no', $op, $like)
                    ->orWhere('first_name', $op, $like)
                    ->orWhere('last_name', $op, $like)
                    ->orWhere('email_company', $op, $like)
                    ->orWhereHas('department', function ($departmentQuery) use ($like, $op) {
                        $departmentQuery->where('name', $op, $like);
                    });
            });
        }

        // Dedicated field filters (combine with AND).
        if ($no = $request->query('employee_no')) {
            $query->where('employee_no', $op, '%'.str_replace('%', '\%', $no).'%');
        }

        if ($name = $request->query('name')) {
            $like = '%'.str_replace('%', '\%', $name).'%';
            $query->where(function ($q) use ($like, $op) {
                $q->where('first_name', $op, $like)
                    ->orWhere('last_name', $op, $like)
                    ->orWhereRaw("CONCAT(first_name, ' ', last_name) {$op} ?", [$like]);
            });
        }

        if ($departmentId = $request->query('department_id')) {
            $query->where('department_id', $departmentId);
        }

        // The employee module reflects the company the user is currently in. An
        // explicit company filter (an admin drilling into another company) overrides
        // it. This also constrains it_admin, who otherwise bypasses the company scope.
        $companyId = $request->query('company_id') ?: $request->user()->active_company_id;
        if ($companyId) {
            $query->where('company_id', $companyId);
        }

        if ($branchId = $request->query('branch_id')) {
            $query->where('branch_id', $branchId);
        }

        // Payroll group filter: confidential vs non-confidential.
        if ($request->has('is_confidential') && $request->query('is_confidential') !== '') {
            $query->where('is_confidential', $request->boolean('is_confidential'));
        }

        if ($request->boolean('only_active', false)) {
            $query->where('is_active', true);
        }

        return $query;
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
            'branch', 'department', 'position', 'employmentType', 'manager', 'compensation',
        ]);

        return new EmployeeResource($employee);
    }

    /**
     * Update the specified employee in storage.
     */
    public function update(UpdateEmployeeRequest $request, Employee $employee): EmployeeResource
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $data = $request->validated();

        // Only senior HR / IT (employee.view.sensitive) may change the confidential
        // classification; strip it for anyone else so a normal update can't flip it.
        if (array_key_exists('is_confidential', $data) && ! $request->user()->can('employee.view.sensitive')) {
            unset($data['is_confidential']);
        }

        $employee->update($data);

        $employee->load(['branch', 'department', 'position', 'employmentType', 'manager', 'compensation']);

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