<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Mail\EmployeeInvitationMail;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class InvitationController extends Controller
{
    // POST /v1/employees/{employee}/invite
    public function send(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);

        $request->validate([
            'email' => ['nullable', 'email'],
        ]);

        $email = $request->input('email')
            ?? $employee->email_company
            ?? $employee->email_personal;

        if (! $email) {
            throw ValidationException::withMessages([
                'email' => 'The employee has no email on file. Provide an email address to send the invitation to.',
            ]);
        }

        // Revoke any previous pending invitation for this employee
        Invitation::where('employee_id', $employee->id)
            ->whereNull('accepted_at')
            ->delete();

        $invitation = Invitation::create([
            'employee_id' => $employee->id,
            'email'       => $email,
            'token'       => Str::random(64),
            'expires_at'  => now()->addHours(72),
        ]);

        // Load the employee relationship for the mail
        $invitation->load('employee');

        Mail::send(new EmployeeInvitationMail($invitation));

        return response()->json([
            'message'    => "Invitation sent to {$email}.",
            'expires_at' => $invitation->expires_at->toIso8601String(),
        ]);
    }

    // POST /v1/employees/bulk-invite
    public function bulkSend(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);

        $request->validate([
            'employee_ids'   => ['required', 'array', 'min:1', 'max:100'],
            'employee_ids.*' => ['integer', 'exists:employees,id'],
        ]);

        $employees = Employee::whereIn('id', $request->employee_ids)->get();

        $sent = 0;
        $skipped = 0;
        $errors = [];

        foreach ($employees as $employee) {
            // Skip employees who already have an active account
            if ($employee->user_id) {
                $skipped++;
                continue;
            }

            $email = $employee->email_company ?? $employee->email_personal;

            if (! $email) {
                $errors[] = "No email for {$employee->full_name} — skipped.";
                $skipped++;
                continue;
            }

            try {
                Invitation::where('employee_id', $employee->id)->whereNull('accepted_at')->delete();

                $invitation = Invitation::create([
                    'employee_id' => $employee->id,
                    'email'       => $email,
                    'token'       => Str::random(64),
                    'expires_at'  => now()->addHours(72),
                ]);

                $invitation->load('employee');
                Mail::send(new EmployeeInvitationMail($invitation));
                $sent++;
            } catch (\Throwable $e) {
                $errors[] = "Failed to invite {$employee->full_name}: {$e->getMessage()}";
            }
        }

        return response()->json([
            'sent'    => $sent,
            'skipped' => $skipped,
            'errors'  => $errors,
        ]);
    }

    // GET /v1/invite/{token}  (public — no auth)
    public function show(string $token): JsonResponse
    {
        $invitation = Invitation::where('token', $token)
            ->with('employee:id,first_name,last_name')
            ->first();

        if (! $invitation || $invitation->isExpired() || $invitation->isAccepted()) {
            return response()->json(['message' => 'This invitation link is invalid or has expired.'], 404);
        }

        return response()->json([
            'email'      => $invitation->email,
            'name'       => trim("{$invitation->employee->first_name} {$invitation->employee->last_name}"),
            'expires_at' => $invitation->expires_at->toIso8601String(),
        ]);
    }

    // POST /v1/invite/{token}/accept  (public — no auth)
    public function accept(Request $request, string $token): JsonResponse
    {
        $invitation = Invitation::where('token', $token)->with('employee')->first();

        if (! $invitation || $invitation->isExpired() || $invitation->isAccepted()) {
            return response()->json(['message' => 'This invitation link is invalid or has expired.'], 404);
        }

        $request->validate([
            'username'              => ['required', 'string', 'min:3', 'max:40', 'alpha_dash', 'unique:users,username'],
            'password'              => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $employee = $invitation->employee;

        // If employee already has a linked user, just update credentials
        if ($employee->user_id) {
            $user = User::findOrFail($employee->user_id);
            $user->update([
                'username'  => $request->username,
                'password'  => $request->password,
                'is_active' => true,
            ]);
        } else {
            // Check if a user with this email already exists (e.g. manually created)
            $user = User::where('email', $invitation->email)->first();

            if ($user) {
                $user->update([
                    'username'  => $request->username,
                    'password'  => $request->password,
                    'is_active' => true,
                ]);
            } else {
                $user = User::create([
                    'name'       => trim("{$employee->first_name} {$employee->last_name}"),
                    'email'      => $invitation->email,
                    'username'   => $request->username,
                    'password'   => $request->password,
                    'is_active'  => true,
                ]);
            }

            // Link employee ↔ user
            $employee->update(['user_id' => $user->id]);

            // Attach to company
            if ($employee->company_id) {
                $user->companies()->syncWithoutDetaching([
                    $employee->company_id => ['is_default' => true],
                ]);
                $user->forceFill(['active_company_id' => $employee->company_id])->save();

                setPermissionsTeamId($employee->company_id);
                $user->assignRole('employee');
            }
        }

        $invitation->update(['accepted_at' => now()]);

        return response()->json(['message' => 'Account set up successfully. You can now log in.']);
    }
}
