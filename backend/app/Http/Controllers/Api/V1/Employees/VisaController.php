<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeVisa;
use App\Http\Controllers\Controller;
use App\Http\Resources\Employees\VisaResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class VisaController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return VisaResource::collection(
            $employee->visas()->orderByDesc('expiration_date')->get(),
        );
    }

    public function store(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $visa = $employee->visas()->create($this->validated($request));

        return (new VisaResource($visa))->response()->setStatusCode(201);
    }

    public function update(Request $request, Employee $employee, EmployeeVisa $visa): VisaResource
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($visa->employee_id === $employee->id, 404);

        $visa->update($this->validated($request, partial: true));

        return new VisaResource($visa);
    }

    public function destroy(Request $request, Employee $employee, EmployeeVisa $visa): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($visa->employee_id === $employee->id, 404);

        $visa->delete();

        return response()->json(['message' => 'Visa removed.']);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'visa_type' => [$req, 'string', 'max:60'],
            'visa_number' => [$req, 'string', 'max:60'],
            'issue_date' => ['nullable', 'date'],
            'expiration_date' => ['nullable', 'date', 'after_or_equal:issue_date'],
            'place_of_issue' => ['nullable', 'string', 'max:150'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);
    }
}
