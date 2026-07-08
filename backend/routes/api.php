<?php

use App\Http\Controllers\Api\V1\Attendance\AttendanceCorrectionController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceDeviceController;
use App\Http\Controllers\Api\V1\Employees\EmployeeImportController;
use App\Http\Controllers\Api\V1\Attendance\CertificateOfAttendanceRequestController;
use App\Http\Controllers\Api\V1\Attendance\DailyTimeRecordController;
use App\Http\Controllers\Api\V1\Attendance\EmployeeScheduleController;
use App\Http\Controllers\Api\V1\Attendance\ScheduleAdjustmentRequestController;
use App\Http\Controllers\Api\V1\Attendance\ShiftAdjustmentController;
use App\Http\Controllers\Api\V1\Attendance\HolidayController;
use App\Http\Controllers\Api\V1\Attendance\OfficialBusinessRequestController;
use App\Http\Controllers\Api\V1\Attendance\OvertimeRequestController;
use App\Http\Controllers\Api\V1\Attendance\TimeLogController;
use App\Http\Controllers\Api\V1\Attendance\UndertimeRequestController;
use App\Http\Controllers\Api\V1\AccessControl\AccessRequestController;
use App\Http\Controllers\Api\V1\Attendance\WorkScheduleController;
use App\Http\Controllers\Api\V1\Admin\AdminStatsController;
use App\Http\Controllers\Api\V1\Auth\ForgotPasswordController;
use App\Http\Controllers\Api\V1\Auth\InvitationController;
use App\Http\Controllers\Api\V1\Auth\ResetPasswordController;
use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\MeController;
use App\Http\Controllers\Api\V1\Me\ChangePasswordController;
use App\Http\Controllers\Api\V1\Me\PendingSummaryController;
use App\Http\Controllers\Api\V1\Me\NotificationController;
use App\Http\Controllers\Api\V1\Companies\CompanyController;
use App\Http\Controllers\Api\V1\Reports\ReportController;
use App\Http\Controllers\Api\V1\Companies\SwitchCompanyController;
use App\Http\Controllers\Api\V1\Employees\BankAccountController;
use App\Http\Controllers\Api\V1\Employees\ContractController;
use App\Http\Controllers\Api\V1\Employees\DependentController;
use App\Http\Controllers\Api\V1\Employees\EducationController;
use App\Http\Controllers\Api\V1\Employees\EmergencyContactController;
use App\Http\Controllers\Api\V1\Employees\EmployeeController;
use App\Http\Controllers\Api\V1\Employees\EmploymentHistoryController;
use App\Http\Controllers\Api\V1\Employees\GovernmentIdController;
use App\Http\Controllers\Api\V1\Leave\LeaveApplicationController;
use App\Http\Controllers\Api\V1\Leave\LeaveBalanceController;
use App\Http\Controllers\Api\V1\Leave\LeaveTypeController;
use App\Http\Controllers\Api\V1\Lookups\LookupController;
use App\Http\Controllers\Api\V1\MasterData\DepartmentController;
use App\Http\Controllers\Api\V1\MasterData\PositionController;
use App\Http\Controllers\Api\V1\Users\UserController;
use App\Http\Middleware\SetPermissionsTeam;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('login', LoginController::class);
    Route::post('forgot-password', ForgotPasswordController::class);
    Route::post('reset-password', ResetPasswordController::class);

    // Public invitation endpoints — employee sets up username/password without being logged in
    Route::get('invite/{token}', [InvitationController::class, 'show']);
    Route::post('invite/{token}/accept', [InvitationController::class, 'accept']);

    Route::middleware(['auth:sanctum', SetPermissionsTeam::class])->group(function () {
        Route::get('me', MeController::class);
        Route::get('my/pending-summary', PendingSummaryController::class);
        Route::post('my/change-password', ChangePasswordController::class);
        Route::get('my/notifications', [NotificationController::class, 'index']);
        Route::post('my/notifications/read-all', [NotificationController::class, 'markAllRead']);
        Route::post('my/notifications/{id}/read', [NotificationController::class, 'markRead']);
        Route::post('logout', LogoutController::class);
        Route::post('companies/switch', SwitchCompanyController::class);
        Route::apiResource('companies', CompanyController::class)->only(['index', 'store', 'show', 'update']);

        // Lookups for dropdowns
        Route::get('lookups/branches', [LookupController::class, 'branches']);
        Route::get('lookups/departments', [LookupController::class, 'departments']);
        Route::get('lookups/positions', [LookupController::class, 'positions']);
        Route::get('lookups/employment-types', [LookupController::class, 'employmentTypes']);
        Route::get('lookups/companies', [LookupController::class, 'companies']);

        // Master data CRUD (departments + positions)
        Route::get('departments', [DepartmentController::class, 'index']);
        Route::post('departments', [DepartmentController::class, 'store']);
        Route::put('departments/{department}', [DepartmentController::class, 'update']);
        Route::delete('departments/{department}', [DepartmentController::class, 'destroy']);

        Route::get('positions', [PositionController::class, 'index']);
        Route::post('positions', [PositionController::class, 'store']);
        Route::put('positions/{position}', [PositionController::class, 'update']);
        Route::delete('positions/{position}', [PositionController::class, 'destroy']);

        // Employees + nested resources (scoped binding ensures child belongs to parent)
        Route::get('employees/import/template', [EmployeeImportController::class, 'template']);
        Route::post('employees/import', [EmployeeImportController::class, 'store']);
        Route::get('employees/export', [EmployeeController::class, 'export']);
        Route::post('employees/bulk-invite', [InvitationController::class, 'bulkSend']);
        Route::apiResource('employees', EmployeeController::class);
        Route::apiResource('employees.dependents', DependentController::class)->scoped();
        Route::apiResource('employees.emergency-contacts', EmergencyContactController::class)
            ->scoped()->parameters(['emergency-contacts' => 'emergencyContact']);
        Route::apiResource('employees.education', EducationController::class)
            ->scoped()->parameters(['education' => 'education']);
        Route::apiResource('employees.employment-history', EmploymentHistoryController::class)
            ->scoped()->parameters(['employment-history' => 'employmentHistory']);
        Route::get('employees/{employee}/government-ids', [GovernmentIdController::class, 'show']);
        Route::put('employees/{employee}/government-ids', [GovernmentIdController::class, 'upsert']);
        Route::apiResource('employees.bank-accounts', BankAccountController::class)
            ->scoped()->only(['index', 'store', 'destroy'])
            ->parameters(['bank-accounts' => 'bankAccount']);
        Route::apiResource('employees.contracts', ContractController::class)
            ->scoped()->only(['index', 'store', 'destroy'])
            ->parameters(['contracts' => 'contract']);

        // Attendance
        Route::apiResource('work-schedules', WorkScheduleController::class)
            ->parameters(['work-schedules' => 'workSchedule']);
        Route::apiResource('holidays', HolidayController::class);

        // Biometric attendance devices (IT + HR)
        Route::apiResource('attendance-devices', AttendanceDeviceController::class)
            ->parameters(['attendance-devices' => 'attendanceDevice']);
        Route::post('attendance-devices/{attendanceDevice}/test', [AttendanceDeviceController::class, 'test']);
        Route::post('attendance-devices/{attendanceDevice}/sync', [AttendanceDeviceController::class, 'sync']);
        Route::get('attendance-devices/{attendanceDevice}/users', [AttendanceDeviceController::class, 'users']);

        Route::get('time-logs', [TimeLogController::class, 'index']);
        Route::post('time-logs', [TimeLogController::class, 'store']);

        Route::get('daily-time-records', [DailyTimeRecordController::class, 'index']);
        Route::get('my/daily-time-records', [DailyTimeRecordController::class, 'mine']);
        Route::post('daily-time-records/compute', [DailyTimeRecordController::class, 'compute']);

        Route::get('employees/{employee}/schedule-assignments', [EmployeeScheduleController::class, 'index']);
        Route::post('employees/{employee}/schedule-assignments', [EmployeeScheduleController::class, 'store']);
        Route::delete('employees/{employee}/schedule-assignments/{schedule}', [EmployeeScheduleController::class, 'destroy']);

        Route::get('schedule-adjustment-requests', [ScheduleAdjustmentRequestController::class, 'index']);
        Route::post('schedule-adjustment-requests', [ScheduleAdjustmentRequestController::class, 'store']);
        Route::post('schedule-adjustment-requests/{scheduleAdjustmentRequest}/approve', [ScheduleAdjustmentRequestController::class, 'approve']);
        Route::post('schedule-adjustment-requests/{scheduleAdjustmentRequest}/reject', [ScheduleAdjustmentRequestController::class, 'reject']);
        Route::post('schedule-adjustment-requests/{scheduleAdjustmentRequest}/cancel', [ScheduleAdjustmentRequestController::class, 'cancel']);

        Route::get('employees/{employee}/shift-adjustments', [ShiftAdjustmentController::class, 'index']);
        Route::post('employees/{employee}/shift-adjustments', [ShiftAdjustmentController::class, 'store']);
        Route::delete('employees/{employee}/shift-adjustments/{shiftAdjustment}', [ShiftAdjustmentController::class, 'destroy']);

        // Leaves (Phase 3.0)
        Route::get('leave-types', [LeaveTypeController::class, 'index']);
        Route::post('leave-types', [LeaveTypeController::class, 'store']);
        Route::put('leave-types/{leaveType}', [LeaveTypeController::class, 'update']);
        Route::delete('leave-types/{leaveType}', [LeaveTypeController::class, 'destroy']);
        Route::get('leave-balances', [LeaveBalanceController::class, 'index']);
        Route::post('leave-balances/{leaveBalance}/adjust', [LeaveBalanceController::class, 'adjust']);
        Route::get('leave-applications', [LeaveApplicationController::class, 'index']);
        Route::post('leave-applications', [LeaveApplicationController::class, 'store']);
        Route::get('leave-applications/{leaveApplication}', [LeaveApplicationController::class, 'show']);
        Route::post('leave-applications/{leaveApplication}/approve', [LeaveApplicationController::class, 'approve']);
        Route::post('leave-applications/{leaveApplication}/reject', [LeaveApplicationController::class, 'reject']);
        Route::post('leave-applications/{leaveApplication}/cancel', [LeaveApplicationController::class, 'cancel']);
        Route::get('leave-applications/{leaveApplication}/attachment', [LeaveApplicationController::class, 'attachment']);

        // Reports (CSV exports)
        Route::get('reports/dtr', [ReportController::class, 'dtr']);
        Route::get('reports/leave', [ReportController::class, 'leave']);
        Route::get('reports/payroll/{payrollRun}', [ReportController::class, 'payroll']);

        // Payroll
        Route::get('compensations', [\App\Http\Controllers\Api\V1\Payroll\CompensationController::class, 'index']);
        Route::post('compensations', [\App\Http\Controllers\Api\V1\Payroll\CompensationController::class, 'store']);
        Route::get('payroll-runs', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'index']);
        Route::post('payroll-runs', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'store']);
        Route::get('payroll-runs/{payrollRun}', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'show']);
        Route::post('payroll-runs/{payrollRun}/compute', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'compute']);
        Route::post('payroll-runs/{payrollRun}/approve', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'approve']);
        Route::post('payroll-runs/{payrollRun}/post', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'post']);
        Route::delete('payroll-runs/{payrollRun}', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'destroy']);

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
        Route::get('roles', [\App\Http\Controllers\Api\V1\Users\RoleController::class, 'index']);
        Route::apiResource('users', UserController::class);
        Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword']);
        Route::patch('users/{user}/deactivate', [UserController::class, 'deactivate']);
        Route::patch('users/{user}/activate', [UserController::class, 'activate']);
        Route::post('employees/{employee}/provision-login', [UserController::class, 'provisionForEmployee']);
        Route::post('employees/{employee}/invite', [InvitationController::class, 'send']);
        Route::get('admin/stats', AdminStatsController::class);

        Route::get('overtime-requests/{overtimeRequest}/attachment', [OvertimeRequestController::class, 'attachment']);

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
