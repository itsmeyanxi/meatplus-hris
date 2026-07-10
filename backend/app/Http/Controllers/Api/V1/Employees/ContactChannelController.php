<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeAddress;
use App\Domain\HRIS\Models\EmployeeEmail;
use App\Domain\HRIS\Models\EmployeePhone;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ContactChannelController extends Controller
{
    // ── Alternate phone numbers ──────────────────────────────────────────────

    public function phones(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return response()->json(['data' => $employee->phones()->get()]);
    }

    public function storePhone(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $phone = $employee->phones()->create($request->validate([
            'title' => ['required', 'string', 'max:60'],
            'contact_no' => ['required', 'string', 'max:50'],
            'contact_name' => ['nullable', 'string', 'max:150'],
        ]));

        return response()->json(['data' => $phone], 201);
    }

    public function destroyPhone(Request $request, Employee $employee, EmployeePhone $phone): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($phone->employee_id === $employee->id, 404);

        $phone->delete();

        return response()->json(['message' => 'Phone removed.']);
    }

    // ── Emails ───────────────────────────────────────────────────────────────

    public function emails(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return response()->json(['data' => $employee->emails()->orderByDesc('is_primary')->get()]);
    }

    public function storeEmail(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $data = $request->validate([
            'email' => [
                'required', 'email', 'max:255',
                Rule::unique('employee_emails')->where('employee_id', $employee->id),
            ],
            'is_primary' => ['sometimes', 'boolean'],
        ]);

        // Exactly one primary. The first email added becomes it by default.
        $isPrimary = (bool) ($data['is_primary'] ?? $employee->emails()->count() === 0);

        if ($isPrimary) {
            $employee->emails()->update(['is_primary' => false]);
        }

        $email = $employee->emails()->create([
            'email' => $data['email'],
            'is_primary' => $isPrimary,
        ]);

        // employees.email_personal is what the rest of the app reads.
        if ($isPrimary) {
            $employee->forceFill(['email_personal' => $data['email']])->save();
        }

        return response()->json(['data' => $email], 201);
    }

    public function destroyEmail(Request $request, Employee $employee, EmployeeEmail $email): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($email->employee_id === $employee->id, 404);

        $wasPrimary = $email->is_primary;
        $email->delete();

        // Promote the next remaining email so email_personal never dangles.
        if ($wasPrimary && ($next = $employee->emails()->first())) {
            $next->update(['is_primary' => true]);
            $employee->forceFill(['email_personal' => $next->email])->save();
        }

        return response()->json(['message' => 'Email removed.']);
    }

    // ── Addresses ────────────────────────────────────────────────────────────

    public function addresses(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return response()->json(['data' => $employee->addresses()->orderByDesc('is_primary')->get()]);
    }

    public function storeAddress(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $data = $request->validate([
            'label' => ['nullable', 'string', 'in:present,permanent,other'],
            'address_line1' => ['required', 'string', 'max:255'],
            'address_line2' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'province' => ['nullable', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:20'],
            'country' => ['nullable', 'string', 'max:100'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);

        $isPrimary = (bool) ($data['is_primary'] ?? $employee->addresses()->count() === 0);

        if ($isPrimary) {
            $employee->addresses()->update(['is_primary' => false]);
        }

        $address = $employee->addresses()->create($data + [
            'label' => $data['label'] ?? 'present',
            'country' => $data['country'] ?? 'Philippines',
            'is_primary' => $isPrimary,
        ]);

        return response()->json(['data' => $address], 201);
    }

    public function destroyAddress(Request $request, Employee $employee, EmployeeAddress $address): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);
        abort_unless($address->employee_id === $employee->id, 404);

        $wasPrimary = $address->is_primary;
        $address->delete();

        if ($wasPrimary && ($next = $employee->addresses()->first())) {
            $next->update(['is_primary' => true]);
        }

        return response()->json(['message' => 'Address removed.']);
    }
}
