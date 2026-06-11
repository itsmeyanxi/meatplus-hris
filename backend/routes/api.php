<?php

use App\Http\Controllers\Api\V1\Attendance\AttendanceCorrectionController;
use App\Http\Controllers\Api\V1\Attendance\CertificateOfAttendanceRequestController;
use App\Http\Controllers\Api\V1\Attendance\DailyTimeRecordController;
use App\Http\Controllers\Api\V1\Attendance\EmployeeScheduleController;
use App\Http\Controllers\Api\V1\Attendance\HolidayController;
use App\Http\Controllers\Api\V1\Attendance\OfficialBusinessRequestController;
use App\Http\Controllers\Api\V1\Attendance\OvertimeRequestController;
use App\Http\Controllers\Api\V1\Attendance\TimeLogController;
use App\Http\Controllers\Api\V1\Attendance\UndertimeRequestController;
use App\Http\Controllers\Api\V1\AccessControl\AccessRequestController;
use App\Http\Controllers\Api\V1\Attendance\WorkScheduleController;
use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\MeController;
use App\Http\Controllers\Api\V1\Companies\SwitchCompanyController;
use App\Http\Controllers\Api\V1\Employees\DependentController;
use App\Http\Controllers\Api\V1\Employees\EducationController;
use App\Http\Controllers\Api\V1\Employees\EmergencyContactController;
use App\Http\Controllers\Api\V1\Employees\EmployeeController;
use App\Http\Controllers\Api\V1\Employees\EmploymentHistoryController;
use App\Http\Controllers\Api\V1\Leave\LeaveApplicationController;
use App\Http\Controllers\Api\V1\Leave\LeaveBalanceController;
use App\Http\Controllers\Api\V1\Leave\LeaveTypeController;
use App\Http\Controllers\Api\V1\Lookups\LookupController;
use App\Http\Controllers\Api\V1\Users\UserController;
use App\Http\Middleware\SetPermissionsTeam;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('login', LoginController::class);

    Route::middleware(['auth:sanctum', SetPermissionsTeam::class])->group(function () {
        Route::get('me', MeController::class);
        Route::post('logout', LogoutController::class);
        Route::post('companies/switch', SwitchCompanyController::class);

        // Lookups for dropdowns
        Route::get('lookups/branches', [LookupController::class, 'branches']);
        Route::get('lookups/departments', [LookupController::class, 'departments']);
        Route::get('lookups/positions', [LookupController::class, 'positions']);
        Route::get('lookups/employment-types', [LookupController::class, 'employmentTypes']);

        // Employees + nested resources (scoped binding ensures child belongs to parent)
        Route::apiResource('employees', EmployeeController::class);
        Route::apiResource('employees.dependents', DependentController::class)->scoped();
        Route::apiResource('employees.emergency-contacts', EmergencyContactController::class)
            ->scoped()->parameters(['emergency-contacts' => 'emergencyContact']);
        Route::apiResource('employees.education', EducationController::class)
            ->scoped()->parameters(['education' => 'education']);
        Route::apiResource('employees.employment-history', EmploymentHistoryController::class)
            ->scoped()->parameters(['employment-history' => 'employmentHistory']);

        // Attendance
        Route::apiResource('work-schedules', WorkScheduleController::class)
            ->parameters(['work-schedules' => 'workSchedule']);
        Route::apiResource('holidays', HolidayController::class);

        Route::get('time-logs', [TimeLogController::class, 'index']);
        Route::post('time-logs', [TimeLogController::class, 'store']);

        Route::get('daily-time-records', [DailyTimeRecordController::class, 'index']);
        Route::get('my/daily-time-records', [DailyTimeRecordController::class, 'mine']);
        Route::post('daily-time-records/compute', [DailyTimeRecordController::class, 'compute']);

        Route::get('employees/{employee}/schedule-assignments', [EmployeeScheduleController::class, 'index']);
        Route::post('employees/{employee}/schedule-assignments', [EmployeeScheduleController::class, 'store']);
        Route::delete('employees/{employee}/schedule-assignments/{schedule}', [EmployeeScheduleController::class, 'destroy']);

        // Leaves (Phase 3.0)
        Route::get('leave-types', [LeaveTypeController::class, 'index']);
        Route::get('leave-balances', [LeaveBalanceController::class, 'index']);
        Route::get('leave-applications', [LeaveApplicationController::class, 'index']);
        Route::post('leave-applications', [LeaveApplicationController::class, 'store']);
        Route::get('leave-applications/{leaveApplication}', [LeaveApplicationController::class, 'show']);
        Route::post('leave-applications/{leaveApplication}/approve', [LeaveApplicationController::class, 'approve']);
        Route::post('leave-applications/{leaveApplication}/reject', [LeaveApplicationController::class, 'reject']);
        Route::post('leave-applications/{leaveApplication}/cancel', [LeaveApplicationController::class, 'cancel']);

        // Access requests (system access request form + supervisor -> HR -> IT approval)
        Route::get('access-requests', [AccessRequestController::class, 'index']);
        Route::get('my/access-requests', [AccessRequestController::class, 'mine']);
        Route::get('access-requests/stats', [AccessRequestController::class, 'stats']);
        Route::post('access-requests', [AccessRequestController::class, 'store']);
        Route::get('access-requests/{accessRequest}', [AccessRequestController::class, 'show']);
        Route::post('access-requests/{accessRequest}/approve', [AccessRequestController::class, 'approve']);
        Route::post('access-requests/{accessRequest}/reject', [AccessRequestController::class, 'reject']);
        Route::post('access-requests/{accessRequest}/cancel', [AccessRequestController::class, 'cancel']);

        // Approval workflows (Phase 2.1)
        // User management (Phase 2.3)
        Route::apiResource('users', UserController::class);
        Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword']);
        Route::post('employees/{employee}/provision-login', [UserController::class, 'provisionForEmployee']);

        foreach ([
            ['overtime-requests', OvertimeRequestController::class, 'overtimeRequest'],
            ['undertime-requests', UndertimeRequestController::class, 'undertimeRequest'],
            ['official-business-requests', OfficialBusinessRequestController::class, 'officialBusinessRequest'],
            ['certificate-of-attendance-requests', CertificateOfAttendanceRequestController::class, 'certificateOfAttendanceRequest'],
            ['attendance-corrections', AttendanceCorrectionController::class, 'attendanceCorrection'],
        ] as [$slug, $ctrl, $param]) {
            Route::apiResource($slug, $ctrl)->except(['update', 'destroy'])
                ->parameters([$slug => $param]);
            Route::post("$slug/{".$param.'}/approve', [$ctrl, 'approve']);
            Route::post("$slug/{".$param.'}/reject', [$ctrl, 'reject']);
            Route::post("$slug/{".$param.'}/cancel', [$ctrl, 'cancel']);
        }
    });
});
