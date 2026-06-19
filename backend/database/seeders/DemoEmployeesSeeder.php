<?php

namespace Database\Seeders;

use App\Domain\Attendance\Models\EmployeeSchedule;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Models\WorkSchedule;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Department;
use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmploymentType;
use App\Domain\HRIS\Models\Position;
use App\Domain\Identity\Models\Branch;
use App\Domain\Identity\Models\Company;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\PermissionRegistrar;

/**
 * Demo accounts for local/testing: three employees with logins, a schedule,
 * and generated attendance history, plus the HR admin login. Idempotent — safe
 * to re-run, and restores the test setup after a `migrate:fresh`.
 */
class DemoEmployeesSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::where('code', 'MPP-MAIN')->firstOrFail();
        app(PermissionRegistrar::class)->setPermissionsTeamId($company->id);

        $branch = Branch::where('company_id', $company->id)->where('code', 'HO')->firstOrFail();
        $regular = EmploymentType::where('company_id', $company->id)->where('code', 'REG')->firstOrFail();
        $schedule = WorkSchedule::where('company_id', $company->id)->where('code', 'STD-MF-8-5')->firstOrFail();

        $it = Department::where('company_id', $company->id)->where('code', 'IT')->firstOrFail();
        $ops = Department::where('company_id', $company->id)->where('code', 'OPS')->firstOrFail();

        // --- Employees ---
        $juan = $this->employee($company, $branch, $regular, $ops, [
            'employee_no' => 'EMP-0001', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'gender' => 'male', 'email_company' => 'juan.delacruz@meatplus.ph',
        ]);
        $kim = $this->employee($company, $branch, $regular, $ops, [
            'employee_no' => '00452', 'first_name' => 'Kim', 'last_name' => 'Lopez',
            'gender' => 'female', 'email_company' => 'kim.lopez@meatplus.ph',
        ]);
        $kenth = $this->employee($company, $branch, $regular, $it, [
            'employee_no' => 'EMP-0002', 'first_name' => 'Kenth Alfred', 'middle_name' => 'Abad',
            'last_name' => 'Condez', 'gender' => 'male', 'email_company' => 'KenthCondez@meatplus.com',
        ]);

        // --- Logins (linked to employees) + roles ---
        $this->login($company, $juan, 'juan.delacruz@meatplus.ph', 'changeme', 'employee');
        $this->login($company, $kim, 'kim.lopez@meatplus.ph', 'changeme', 'employee');
        $this->login($company, $kenth, 'KenthCondez@meatplus.com', 'Pass@123', 'it_admin');

        // --- HR admin (no employee record) ---
        $this->login($company, null, 'hr@meatplus.ph', 'HrAdmin@123', 'hr_admin', 'HR Administrator');

        // --- Schedule + attendance history ---
        $from = Carbon::today()->subDays(75);
        $to = Carbon::today();
        foreach ([$juan, $kim, $kenth] as $employee) {
            EmployeeSchedule::firstOrCreate(
                ['employee_id' => $employee->id, 'work_schedule_id' => $schedule->id],
                ['effective_from' => '2024-01-01', 'effective_to' => null],
            );
            $this->generateAttendance($employee, $from, $to);
        }
    }

    private function employee(Company $company, Branch $branch, EmploymentType $type, Department $dept, array $attrs): Employee
    {
        $position = Position::where('company_id', $company->id)->where('department_id', $dept->id)->firstOrFail();

        return Employee::firstOrCreate(
            ['company_id' => $company->id, 'employee_no' => $attrs['employee_no']],
            array_merge([
                'birth_date' => '1995-06-15',
                'civil_status' => 'single',
                'nationality' => 'Filipino',
                'branch_id' => $branch->id,
                'department_id' => $dept->id,
                'position_id' => $position->id,
                'employment_type_id' => $type->id,
                'date_hired' => '2024-01-15',
                'is_active' => true,
            ], $attrs),
        );
    }

    private function login(Company $company, ?Employee $employee, string $email, string $password, string $role, ?string $name = null): void
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name' => $name ?? ($employee?->full_name ?? $email),
                'password' => Hash::make($password),
                'is_active' => true,
                'active_company_id' => $company->id,
            ],
        );

        $user->companies()->syncWithoutDetaching([$company->id => ['is_default' => true]]);
        $user->syncRoles([$role]);

        if ($employee && $employee->user_id !== $user->id) {
            $employee->forceFill(['user_id' => $user->id])->save();
        }
    }

    /** Generate biometric in/out punches Mon-Fri, then compute the DTRs. Skips if already seeded. */
    private function generateAttendance(Employee $employee, Carbon $from, Carbon $to): void
    {
        if (TimeLog::where('employee_id', $employee->id)->exists()) {
            return;
        }

        $rows = [];
        for ($day = $from->copy(); $day->lte($to); $day->addDay()) {
            if ($day->isWeekend()) {
                continue;
            }
            if (mt_rand(1, 100) <= 6) {
                continue; // ~6% absent
            }

            $in = $day->copy()->setTime(8, 0)->addMinutes(mt_rand(-6, 28));   // sometimes late
            $out = $day->copy()->setTime(17, 0)->addMinutes(mt_rand(-3, 40)); // sometimes OT/undertime

            foreach ([[$in, 'in'], [$out, 'out']] as [$ts, $dir]) {
                $rows[] = [
                    'company_id' => $employee->company_id,
                    'employee_id' => $employee->id,
                    'logged_at' => $ts->toDateTimeString(),
                    'direction' => $dir,
                    'source' => 'biometric',
                    'device_id' => 'DEMO-DEV-1',
                ];
            }
        }

        if ($rows) {
            TimeLog::insert($rows);
            app(DtrComputer::class)->computeForEmployee(
                $employee,
                CarbonImmutable::parse($from->toDateString()),
                CarbonImmutable::parse($to->toDateString()),
            );
        }
    }
}
