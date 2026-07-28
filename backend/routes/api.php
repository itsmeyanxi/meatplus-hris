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
use App\Http\Controllers\Api\V1\Employees\BenefitController;
use App\Http\Controllers\Api\V1\Employees\ContactChannelController;
use App\Http\Controllers\Api\V1\Employees\ContractController;
use App\Http\Controllers\Api\V1\Employees\DependentController;
use App\Http\Controllers\Api\V1\Employees\EmployeeAssetController;
use App\Http\Controllers\Api\V1\Employees\EmployeeRecordController;
use App\Http\Controllers\Api\V1\Employees\EducationController;
use App\Http\Controllers\Api\V1\Employees\EmergencyContactController;
use App\Http\Controllers\Api\V1\Employees\EmployeeController;
use App\Http\Controllers\Api\V1\Employees\EmploymentHistoryController;
use App\Http\Controllers\Api\V1\Employees\GovernmentIdController;
use App\Http\Controllers\Api\V1\Employees\LocationController;
use App\Http\Controllers\Api\V1\Employees\PerformanceController;
use App\Http\Controllers\Api\V1\Employees\PerformanceGoalController;
use App\Http\Controllers\Api\V1\Employees\PhotoController;
use App\Http\Controllers\Api\V1\Employees\VisaController;
use App\Http\Controllers\Api\V1\Leave\LeaveApplicationController;
use App\Http\Controllers\Api\V1\Leave\LeaveBalanceController;
use App\Http\Controllers\Api\V1\Leave\LeaveTypeController;
use App\Http\Controllers\Api\V1\Lookups\LookupController;
use App\Http\Controllers\Api\V1\MasterData\DepartmentController;
use App\Http\Controllers\Api\V1\MasterData\ReferenceItemController;
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
        Route::get('my/team', \App\Http\Controllers\Api\V1\Me\TeamController::class);
        Route::get('my/approvals', \App\Http\Controllers\Api\V1\Me\ApprovalCenterController::class);
        // Cross-company admin overview (super-admins only; gated inside the controller)
        Route::get('admin/overview', \App\Http\Controllers\Api\V1\Admin\OverviewController::class);
        Route::get('my/payslips', [\App\Http\Controllers\Api\V1\Me\PayslipController::class, 'index']);
        Route::get('my/payslips/{payslip}', [\App\Http\Controllers\Api\V1\Me\PayslipController::class, 'show']);
        Route::get('my/time-clock', [\App\Http\Controllers\Api\V1\Me\TimeClockController::class, 'show']);
        Route::post('my/time-clock', [\App\Http\Controllers\Api\V1\Me\TimeClockController::class, 'store']);
        Route::get('audit-trail', [\App\Http\Controllers\Api\V1\Admin\AuditTrailController::class, 'index']);
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

        // Branch geofence administration (worksite GPS pin + radius)
        Route::get('branches', [\App\Http\Controllers\Api\V1\Identity\BranchController::class, 'index']);
        Route::patch('branches/{branch}', [\App\Http\Controllers\Api\V1\Identity\BranchController::class, 'update']);

        // Master data CRUD (departments + positions)
        Route::get('departments', [DepartmentController::class, 'index']);
        Route::post('departments', [DepartmentController::class, 'store']);
        Route::put('departments/{department}', [DepartmentController::class, 'update']);
        Route::delete('departments/{department}', [DepartmentController::class, 'destroy']);

        Route::get('positions', [PositionController::class, 'index']);
        Route::post('positions', [PositionController::class, 'store']);
        Route::put('positions/{position}', [PositionController::class, 'update']);
        Route::delete('positions/{position}', [PositionController::class, 'destroy']);

        // Generic reference lists (asset types, visa types, benefit types, work locations)
        Route::get('reference/{category}', [ReferenceItemController::class, 'index']);
        Route::post('reference/{category}', [ReferenceItemController::class, 'store']);
        Route::put('reference/{category}/{referenceItem}', [ReferenceItemController::class, 'update']);
        Route::delete('reference/{category}/{referenceItem}', [ReferenceItemController::class, 'destroy']);

        // Employees + nested resources (scoped binding ensures child belongs to parent)
        Route::get('employees/import/template', [EmployeeImportController::class, 'template']);
        Route::post('employees/import', [EmployeeImportController::class, 'store']);
        Route::get('employees/export', [EmployeeController::class, 'export']);
        Route::post('employees/bulk-invite', [InvitationController::class, 'bulkSend']);
        Route::apiResource('employees', EmployeeController::class);
        Route::apiResource('employees.dependents', DependentController::class)->scoped();
        Route::apiResource('employees.assets', EmployeeAssetController::class)
            ->scoped()->only(['index', 'store', 'update', 'destroy']);

        // Generic per-employee records (advances, training, memos, seminars, …)
        Route::get('employees/{employee}/records/{type}', [EmployeeRecordController::class, 'index']);
        Route::post('employees/{employee}/records/{type}', [EmployeeRecordController::class, 'store']);
        Route::put('employees/{employee}/records/{type}/{record}', [EmployeeRecordController::class, 'update']);
        Route::delete('employees/{employee}/records/{type}/{record}', [EmployeeRecordController::class, 'destroy']);
        Route::apiResource('employees.emergency-contacts', EmergencyContactController::class)
            ->scoped()->parameters(['emergency-contacts' => 'emergencyContact']);
        Route::apiResource('employees.education', EducationController::class)
            ->scoped()->parameters(['education' => 'education']);
        Route::apiResource('employees.performance', PerformanceController::class)
            ->scoped()->parameters(['performance' => 'performance']);
        Route::get('employees/{employee}/performance-goals', [PerformanceGoalController::class, 'index']);
        Route::post('employees/{employee}/performance-goals', [PerformanceGoalController::class, 'store']);
        Route::put('employees/{employee}/performance-goals/{goal}', [PerformanceGoalController::class, 'update']);
        Route::delete('employees/{employee}/performance-goals/{goal}', [PerformanceGoalController::class, 'destroy']);
        Route::apiResource('employees.visas', VisaController::class)
            ->scoped()->parameters(['visas' => 'visa'])->except(['show']);
        Route::apiResource('employees.benefits', BenefitController::class)
            ->scoped()->parameters(['benefits' => 'benefit'])->except(['show']);

        Route::get('employees/{employee}/phones', [ContactChannelController::class, 'phones']);
        Route::post('employees/{employee}/phones', [ContactChannelController::class, 'storePhone']);
        Route::delete('employees/{employee}/phones/{phone}', [ContactChannelController::class, 'destroyPhone']);

        Route::get('employees/{employee}/emails', [ContactChannelController::class, 'emails']);
        Route::post('employees/{employee}/emails', [ContactChannelController::class, 'storeEmail']);
        Route::delete('employees/{employee}/emails/{email}', [ContactChannelController::class, 'destroyEmail']);

        Route::get('employees/{employee}/addresses', [ContactChannelController::class, 'addresses']);
        Route::post('employees/{employee}/addresses', [ContactChannelController::class, 'storeAddress']);
        Route::delete('employees/{employee}/addresses/{address}', [ContactChannelController::class, 'destroyAddress']);

        Route::get('employees/{employee}/locations', [LocationController::class, 'index']);
        Route::post('employees/{employee}/locations', [LocationController::class, 'store']);
        Route::delete('employees/{employee}/locations/{location}', [LocationController::class, 'destroy']);
        Route::get('employees/{employee}/photo', [PhotoController::class, 'show']);
        Route::post('employees/{employee}/photo', [PhotoController::class, 'store']);
        Route::delete('employees/{employee}/photo', [PhotoController::class, 'destroy']);
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
        Route::get('time-logs/export', [TimeLogController::class, 'export']);
        Route::get('time-logs/devices', [TimeLogController::class, 'devices']);
        Route::post('time-logs', [TimeLogController::class, 'store']);

        // Admin-uploaded time logs awaiting approval (staged, don't touch DTR until approved)
        Route::get('time-log-requests', [\App\Http\Controllers\Api\V1\Attendance\TimeLogRequestController::class, 'index']);
        Route::get('time-log-requests/template', [\App\Http\Controllers\Api\V1\Attendance\TimeLogRequestController::class, 'template']);
        Route::post('time-log-requests/import', [\App\Http\Controllers\Api\V1\Attendance\TimeLogRequestController::class, 'import']);
        Route::post('time-log-requests/approve-batch', [\App\Http\Controllers\Api\V1\Attendance\TimeLogRequestController::class, 'approveBatch']);
        Route::post('time-log-requests/{timeLogRequest}/approve', [\App\Http\Controllers\Api\V1\Attendance\TimeLogRequestController::class, 'approve']);
        Route::post('time-log-requests/{timeLogRequest}/reject', [\App\Http\Controllers\Api\V1\Attendance\TimeLogRequestController::class, 'reject']);

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
        Route::post('employees/{employee}/leave-balances', [LeaveBalanceController::class, 'assign']);
        Route::post('leave-balances/{leaveBalance}/adjust', [LeaveBalanceController::class, 'adjust']);
        Route::get('leave-applications', [LeaveApplicationController::class, 'index']);
        Route::get('leave-applications/import/template', [LeaveApplicationController::class, 'importTemplate']);
        Route::post('leave-applications/import', [LeaveApplicationController::class, 'import']);
        Route::post('leave-applications', [LeaveApplicationController::class, 'store']);
        Route::get('leave-applications/{leaveApplication}', [LeaveApplicationController::class, 'show']);
        Route::post('leave-applications/{leaveApplication}/approve', [LeaveApplicationController::class, 'approve']);
        Route::post('leave-applications/{leaveApplication}/reject', [LeaveApplicationController::class, 'reject']);
        Route::post('leave-applications/{leaveApplication}/cancel', [LeaveApplicationController::class, 'cancel']);
        Route::get('leave-applications/{leaveApplication}/attachment', [LeaveApplicationController::class, 'attachment']);

        // Reports (CSV exports)
        Route::get('reports/full-export', [ReportController::class, 'fullExport']);
        Route::get('reports/dtr', [ReportController::class, 'dtr']);
        Route::get('reports/attendance-summary', [ReportController::class, 'attendanceSummary']);
        Route::get('reports/compensation', [ReportController::class, 'compensation']);
        Route::get('reports/leave', [ReportController::class, 'leave']);
        Route::get('reports/overtime', [ReportController::class, 'overtime']);
        Route::get('reports/payroll/{payrollRun}', [ReportController::class, 'payroll']);

        // Payroll
        Route::get('payroll/timekeeping', [\App\Http\Controllers\Api\V1\Payroll\PayrollTimekeepingController::class, 'index']);
        Route::get('payroll/timekeeping/export', [\App\Http\Controllers\Api\V1\Payroll\PayrollTimekeepingController::class, 'export']);
        Route::get('payroll/timekeeping/{employee}', [\App\Http\Controllers\Api\V1\Payroll\PayrollTimekeepingController::class, 'detail']);
        Route::post('payroll/timekeeping/remind', [\App\Http\Controllers\Api\V1\Payroll\PayrollTimekeepingController::class, 'remind']);
        Route::get('compensations', [\App\Http\Controllers\Api\V1\Payroll\CompensationController::class, 'index']);
        Route::post('compensations', [\App\Http\Controllers\Api\V1\Payroll\CompensationController::class, 'store']);
        // Payroll User Access — per-company payroll role grants.
        Route::get('payroll-access', [\App\Http\Controllers\Api\V1\Payroll\PayrollAccessController::class, 'index']);
        Route::get('payroll-access/options', [\App\Http\Controllers\Api\V1\Payroll\PayrollAccessController::class, 'options']);
        Route::post('payroll-access', [\App\Http\Controllers\Api\V1\Payroll\PayrollAccessController::class, 'store']);
        Route::delete('payroll-access', [\App\Http\Controllers\Api\V1\Payroll\PayrollAccessController::class, 'destroy']);

        Route::get('employees/{employee}/payroll-profile', [\App\Http\Controllers\Api\V1\Payroll\PayrollProfileController::class, 'show']);
        Route::put('employees/{employee}/payroll-profile', [\App\Http\Controllers\Api\V1\Payroll\PayrollProfileController::class, 'upsert']);
        Route::get('employees/{employee}/compensations', [\App\Http\Controllers\Api\V1\Payroll\CompensationController::class, 'history']);
        Route::delete('employees/{employee}/compensations/{compensation}', [\App\Http\Controllers\Api\V1\Payroll\CompensationController::class, 'destroy']);
        Route::get('payroll-runs', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'index']);
        Route::post('payroll-runs', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'store']);
        Route::get('payroll-runs/{payrollRun}', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'show']);
        Route::post('payroll-runs/{payrollRun}/compute', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'compute']);
        Route::post('payroll-runs/{payrollRun}/approve', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'approve']);
        Route::post('payroll-runs/{payrollRun}/post', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'post']);
        Route::delete('payroll-runs/{payrollRun}', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'destroy']);
        Route::get('payroll-runs/{payrollRun}/bank-file', [\App\Http\Controllers\Api\V1\Payroll\PayrollRunController::class, 'bankFile']);

        // One-off adjustments on a run (earnings/deductions)
        Route::get('payroll-runs/{payrollRun}/adjustments', [\App\Http\Controllers\Api\V1\Payroll\PayslipAdjustmentController::class, 'index']);
        Route::post('payroll-runs/{payrollRun}/adjustments', [\App\Http\Controllers\Api\V1\Payroll\PayslipAdjustmentController::class, 'store']);
        Route::delete('payroll-adjustments/{adjustment}', [\App\Http\Controllers\Api\V1\Payroll\PayslipAdjustmentController::class, 'destroy']);

        // Recurring loans / amortized deductions
        Route::get('payroll/loans', [\App\Http\Controllers\Api\V1\Payroll\EmployeeLoanController::class, 'index']);
        Route::get('payroll/loans/export', [\App\Http\Controllers\Api\V1\Payroll\EmployeeLoanController::class, 'export']);
        Route::get('payroll/loans/import/template', [\App\Http\Controllers\Api\V1\Payroll\EmployeeLoanController::class, 'importTemplate']);
        Route::post('payroll/loans/import', [\App\Http\Controllers\Api\V1\Payroll\EmployeeLoanController::class, 'import']);
        Route::post('payroll/loans', [\App\Http\Controllers\Api\V1\Payroll\EmployeeLoanController::class, 'store']);
        Route::patch('payroll/loans/{loan}', [\App\Http\Controllers\Api\V1\Payroll\EmployeeLoanController::class, 'update']);
        Route::delete('payroll/loans/{loan}', [\App\Http\Controllers\Api\V1\Payroll\EmployeeLoanController::class, 'destroy']);

        // Final pay
        Route::get('final-pays', [\App\Http\Controllers\Api\V1\Payroll\FinalPayController::class, 'index']);
        Route::post('final-pays/compute', [\App\Http\Controllers\Api\V1\Payroll\FinalPayController::class, 'compute']);
        Route::post('final-pays', [\App\Http\Controllers\Api\V1\Payroll\FinalPayController::class, 'store']);
        Route::get('final-pays/{finalPay}', [\App\Http\Controllers\Api\V1\Payroll\FinalPayController::class, 'show']);
        Route::get('final-pays/{finalPay}/payroll-history', [\App\Http\Controllers\Api\V1\Payroll\FinalPayController::class, 'payrollHistory']);
        Route::patch('final-pays/{finalPay}', [\App\Http\Controllers\Api\V1\Payroll\FinalPayController::class, 'update']);
        Route::delete('final-pays/{finalPay}', [\App\Http\Controllers\Api\V1\Payroll\FinalPayController::class, 'destroy']);

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
        Route::get('overtime-requests/import/template', [OvertimeRequestController::class, 'importTemplate']);
        Route::post('overtime-requests/import', [OvertimeRequestController::class, 'import']);

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
