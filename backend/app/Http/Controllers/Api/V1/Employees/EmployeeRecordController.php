<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeRecord;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Generic per-employee secondary records (advances, training, memos, seminars,
 * movements, medical records, requirements). The type comes from the route and
 * must be allowlisted; the record's fields are stored in `data`.
 */
class EmployeeRecordController extends Controller
{
    private const TYPES = [
        'advance', 'training', 'memo', 'seminar',
        'movement', 'medical_record', 'requirements',
    ];

    private function assertType(string $type): void
    {
        if (! in_array($type, self::TYPES, true)) {
            throw ValidationException::withMessages(['type' => 'Unknown record type.']);
        }
    }

    public function index(Request $request, Employee $employee, string $type): JsonResponse
    {
        abort_unless($request->user()->can('employee.view'), 403);
        $this->assertType($type);

        $rows = $employee->records()
            ->where('type', $type)
            ->orderByDesc('id')
            ->get(['id', 'data', 'created_at'])
            ->map(fn ($r) => ['id' => $r->id, ...$r->data]);

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request, Employee $employee, string $type): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        $this->assertType($type);

        $data = $request->validate(['data' => ['required', 'array']])['data'];
        $record = $employee->records()->create(['type' => $type, 'data' => $data]);

        return response()->json(['data' => ['id' => $record->id, ...$record->data]], 201);
    }

    public function update(Request $request, Employee $employee, string $type, EmployeeRecord $record): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        $this->assertType($type);
        abort_if($record->employee_id !== $employee->id || $record->type !== $type, 404);

        $data = $request->validate(['data' => ['required', 'array']])['data'];
        $record->update(['data' => $data]);

        return response()->json(['data' => ['id' => $record->id, ...$record->data]]);
    }

    public function destroy(Request $request, Employee $employee, string $type, EmployeeRecord $record): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        $this->assertType($type);
        abort_if($record->employee_id !== $employee->id || $record->type !== $type, 404);

        $record->delete();

        return response()->json(['message' => 'Removed.']);
    }
}
