<?php

namespace App\Http\Controllers\Api\V1\Me;

use App\Domain\Attendance\Models\AttendanceCorrection;
use App\Domain\Attendance\Models\CertificateOfAttendanceRequest;
use App\Domain\Attendance\Models\OfficialBusinessRequest;
use App\Domain\Attendance\Models\OvertimeRequest;
use App\Domain\Attendance\Models\UndertimeRequest;
use App\Domain\Leave\Models\LeaveApplication;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PendingSummaryController extends Controller
{
    /**
     * Count the signed-in user's OWN pending requests across leaves and the five
     * attendance request types. Replaces six separate list calls from the
     * dashboard. Returns zeros when the account has no linked employee.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;

        if (! $employee) {
            return response()->json(['pending_total' => 0, 'leaves' => 0, 'attendance' => 0]);
        }

        $eid = $employee->id;
        $count = fn (string $model): int => $model::query()
            ->where('employee_id', $eid)
            ->where('status', 'pending')
            ->count();

        $leaves = $count(LeaveApplication::class);
        $attendance =
            $count(OvertimeRequest::class)
            + $count(UndertimeRequest::class)
            + $count(OfficialBusinessRequest::class)
            + $count(CertificateOfAttendanceRequest::class)
            + $count(AttendanceCorrection::class);

        return response()->json([
            'pending_total' => $leaves + $attendance,
            'leaves' => $leaves,
            'attendance' => $attendance,
        ]);
    }
}
