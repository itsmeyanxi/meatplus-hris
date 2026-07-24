<?php

namespace Database\Seeders;

use App\Domain\Attendance\Models\EmployeeSchedule;
use App\Domain\Attendance\Models\Holiday;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Models\WorkSchedule;
use App\Domain\Attendance\Models\WorkScheduleDay;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Department;
use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmploymentType;
use App\Domain\HRIS\Models\Position;
use App\Domain\Identity\Models\Branch;
use App\Domain\Identity\Models\Company;
use App\Domain\Leave\Models\LeaveBalance;
use App\Domain\Leave\Models\LeaveType;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\EmployeePayrollProfile;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * A throwaway sandbox company ("DEMO") for letting people try the system without
 * touching real payroll data. Self-contained: its own branches, org structure,
 * work schedule, holidays, leave types, employees, logins and 90 days of
 * attendance history. Idempotent — safe to re-run.
 *
 *     php artisan db:seed --class=DemoCompanySeeder
 *
 * Deliberately NOT wired into DatabaseSeeder: a demo company should be an
 * explicit decision per environment, not something a fresh migrate creates.
 *
 * SECURITY: no demo account gets `it_admin` or `hr_admin`. Those are
 * company-wide roles (SwitchCompanyController::ADMIN_ROLES) — holders are
 * auto-attached to every company on login, so a demo admin handed out to
 * testers would also open MPP-MAIN and the rest. The roles used here are all
 * company-scoped, so testers stay inside DEMO.
 */
class DemoCompanySeeder extends Seeder
{
    private const CODE = 'DEMO';

    /** Same password for every demo login — these accounts hold no real data. */
    private const PASSWORD = 'Demo@123';

    public function run(): void
    {
        $company = Company::firstOrCreate(
            ['code' => self::CODE],
            [
                'legal_name' => 'Demo Company, Inc.',
                'trade_name' => 'Demo Co (Sandbox)',
                'country' => 'Philippines',
                'contact_email' => 'demo@meatplus.ph',
                'is_active' => true,
            ],
        );

        $this->ensureRolesExist();
        app(PermissionRegistrar::class)->setPermissionsTeamId($company->id);

        $branches = $this->branches($company);
        $types = $this->employmentTypes($company);
        $departments = $this->orgStructure($company);
        $schedule = $this->workSchedule($company);
        $this->holidays($company);
        $leaveTypes = $this->leaveTypes($company);

        $employees = $this->employees($company, $branches, $types, $departments);
        $this->logins($company, $employees);
        $this->compensation($company, $employees);
        $this->leaveBalances($employees, $leaveTypes);
        $this->attendance($employees, $schedule);
    }

    /**
     * Roles live outside any company (company_id null) and are created by
     * PermissionsSeeder. If this seeder runs on a database that never got it,
     * assigning a role would blow up with a bare RoleDoesNotExist — run it.
     */
    private function ensureRolesExist(): void
    {
        $needed = ['hr_officer', 'payroll_officer', 'dept_head', 'timekeeper', 'employee'];

        if (Role::whereIn('name', $needed)->count() < count($needed)) {
            $this->call(PermissionsSeeder::class);
        }
    }

    /** @return array<string, Branch> */
    private function branches(Company $company): array
    {
        $rows = [
            ['code' => 'HO', 'name' => 'Demo Head Office', 'is_head_office' => true],
            ['code' => 'PLANT', 'name' => 'Demo Plant', 'is_head_office' => false],
        ];

        $branches = [];
        foreach ($rows as $b) {
            $branches[$b['code']] = Branch::firstOrCreate(
                ['company_id' => $company->id, 'code' => $b['code']],
                ['name' => $b['name'], 'is_head_office' => $b['is_head_office'], 'is_active' => true],
            );
        }

        return $branches;
    }

    /** @return array<string, EmploymentType> */
    private function employmentTypes(Company $company): array
    {
        $rows = [
            ['code' => 'REG', 'name' => 'Regular', 'is_regular' => true],
            ['code' => 'PROB', 'name' => 'Probationary', 'is_regular' => false],
            ['code' => 'CONTRACT', 'name' => 'Contractual', 'is_regular' => false],
            ['code' => 'INTERN', 'name' => 'Intern', 'is_regular' => false],
        ];

        $types = [];
        foreach ($rows as $t) {
            $types[$t['code']] = EmploymentType::firstOrCreate(
                ['company_id' => $company->id, 'code' => $t['code']],
                ['name' => $t['name'], 'is_regular' => $t['is_regular'], 'is_active' => true],
            );
        }

        return $types;
    }

    /**
     * Departments, each with a staff position and a head position so the demo
     * has something to hang an approval chain off.
     *
     * @return array<string, array{dept: Department, staff: Position, head: Position}>
     */
    private function orgStructure(Company $company): array
    {
        $rows = [
            ['code' => 'HR', 'name' => 'Human Resources'],
            ['code' => 'FIN', 'name' => 'Finance & Accounting'],
            ['code' => 'IT', 'name' => 'Information Technology'],
            ['code' => 'OPS', 'name' => 'Operations'],
        ];

        $out = [];
        foreach ($rows as $d) {
            $dept = Department::firstOrCreate(
                ['company_id' => $company->id, 'code' => $d['code']],
                ['name' => $d['name'], 'is_active' => true],
            );

            $out[$d['code']] = [
                'dept' => $dept,
                'staff' => $this->position($company, $dept, $d['name'].' Staff'),
                'head' => $this->position($company, $dept, $d['name'].' Head'),
            ];
        }

        return $out;
    }

    private function position(Company $company, Department $dept, string $title): Position
    {
        return Position::firstOrCreate(
            ['company_id' => $company->id, 'department_id' => $dept->id, 'title' => $title],
            ['is_active' => true],
        );
    }

    /** Standard Mon-Fri 8-5, mirroring the production default so DTRs look familiar. */
    private function workSchedule(Company $company): WorkSchedule
    {
        $schedule = WorkSchedule::firstOrCreate(
            ['company_id' => $company->id, 'code' => 'STD-MF-8-5'],
            [
                'name' => 'Standard Mon-Fri 8:00 AM - 5:00 PM',
                'description' => '8-hour day shift, 1-hour unpaid lunch break, Sat-Sun rest',
                'is_flexible' => false,
                'breaks_paid' => false,
                'weekly_workdays' => 5,
                'is_active' => true,
            ],
        );

        // 0=Sun … 6=Sat
        foreach (range(0, 6) as $dow) {
            $rest = $dow === 0 || $dow === 6;

            WorkScheduleDay::firstOrCreate(
                ['work_schedule_id' => $schedule->id, 'day_of_week' => $dow],
                [
                    'is_rest_day' => $rest,
                    'time_in' => $rest ? null : '08:00:00',
                    'time_out' => $rest ? null : '17:00:00',
                    'break_minutes' => $rest ? 0 : 60,
                    'required_hours' => $rest ? 0 : 8,
                ],
            );
        }

        return $schedule;
    }

    /**
     * Copy the main company's holiday calendar so demo DTRs and payroll runs hit
     * the same holiday rules. If MPP-MAIN isn't seeded, the demo simply has none
     * and HR can add them from the UI — that's a fine thing for testers to try.
     */
    private function holidays(Company $company): void
    {
        $source = Company::where('code', 'MPP-MAIN')->first();
        if (! $source) {
            return;
        }

        foreach (Holiday::where('company_id', $source->id)->get() as $holiday) {
            Holiday::firstOrCreate(
                ['company_id' => $company->id, 'holiday_date' => $holiday->holiday_date],
                ['name' => $holiday->name, 'type' => $holiday->type],
            );
        }
    }

    /**
     * Same four types the real companies offer, but with credits pre-loaded so a
     * tester can actually file and approve a leave without HR setup first.
     *
     * @return array<string, LeaveType>
     */
    private function leaveTypes(Company $company): array
    {
        $rows = [
            ['code' => 'VL', 'name' => 'Vacation Leave', 'credits' => 15, 'paid' => true, 'accrual' => 'annual', 'lead' => 1, 'max' => null],
            ['code' => 'SL', 'name' => 'Sick Leave', 'credits' => 15, 'paid' => true, 'accrual' => 'annual', 'lead' => 0, 'max' => null],
            ['code' => 'BDL', 'name' => 'Birthday Leave', 'credits' => 1, 'paid' => true, 'accrual' => 'annual', 'lead' => 0, 'max' => 1],
            ['code' => 'LWOP', 'name' => 'Leave Without Pay', 'credits' => 0, 'paid' => false, 'accrual' => 'none', 'lead' => 0, 'max' => null],
        ];

        $types = [];
        foreach ($rows as $t) {
            $types[$t['code']] = LeaveType::updateOrCreate(
                ['company_id' => $company->id, 'code' => $t['code']],
                [
                    'name' => $t['name'],
                    'default_credits_per_year' => $t['credits'],
                    'is_paid' => $t['paid'],
                    'requires_attachment' => false,
                    'gender_restriction' => null,
                    'accrual_method' => $t['accrual'],
                    'min_days_filing_lead' => $t['lead'],
                    'max_consecutive_days' => $t['max'],
                    'is_active' => true,
                ],
            );
        }

        return $types;
    }

    /**
     * Six employees covering the shapes worth testing: a department head who
     * approves, staff who file, a probationary hire, and one record with no
     * login at all (HR-managed only).
     *
     * @param  array<string, Branch>  $branches
     * @param  array<string, EmploymentType>  $types
     * @param  array<string, array{dept: Department, staff: Position, head: Position}>  $org
     * @return array<string, Employee>
     */
    private function employees(Company $company, array $branches, array $types, array $org): array
    {
        $ho = $branches['HO'];
        $plant = $branches['PLANT'];

        $head = $this->employee($company, [
            'employee_no' => 'DEMO-0001',
            'first_name' => 'Carla', 'middle_name' => 'Reyes', 'last_name' => 'Dizon',
            'gender' => 'female', 'birth_date' => '1986-03-11',
            'email_company' => 'carla.dizon@demo.meatplus.ph',
            'branch_id' => $ho->id,
            'department_id' => $org['OPS']['dept']->id,
            'position_id' => $org['OPS']['head']->id,
            'employment_type_id' => $types['REG']->id,
            'date_hired' => '2019-02-01',
            'date_regularized' => '2019-08-01',
        ]);

        $rows = [
            [
                'key' => 'hr',
                'employee_no' => 'DEMO-0002',
                'first_name' => 'Ana', 'middle_name' => 'Lim', 'last_name' => 'Bautista',
                'gender' => 'female', 'birth_date' => '1992-09-04',
                'email_company' => 'ana.bautista@demo.meatplus.ph',
                'branch_id' => $ho->id,
                'department_id' => $org['HR']['dept']->id,
                'position_id' => $org['HR']['staff']->id,
                'employment_type_id' => $types['REG']->id,
                'date_hired' => '2021-06-15',
                'date_regularized' => '2021-12-15',
            ],
            [
                'key' => 'payroll',
                'employee_no' => 'DEMO-0003',
                'first_name' => 'Ben', 'middle_name' => 'Uy', 'last_name' => 'Santos',
                'gender' => 'male', 'birth_date' => '1990-01-22',
                'email_company' => 'ben.santos@demo.meatplus.ph',
                'branch_id' => $ho->id,
                'department_id' => $org['FIN']['dept']->id,
                'position_id' => $org['FIN']['staff']->id,
                'employment_type_id' => $types['REG']->id,
                'date_hired' => '2020-03-02',
                'date_regularized' => '2020-09-02',
            ],
            [
                'key' => 'staff',
                'employee_no' => 'DEMO-0004',
                'first_name' => 'Dino', 'last_name' => 'Cruz',
                'gender' => 'male', 'birth_date' => '1997-11-30',
                'email_company' => 'dino.cruz@demo.meatplus.ph',
                'branch_id' => $plant->id,
                'department_id' => $org['OPS']['dept']->id,
                'position_id' => $org['OPS']['staff']->id,
                'employment_type_id' => $types['REG']->id,
                'date_hired' => '2022-08-01',
                'date_regularized' => '2023-02-01',
                'manager_employee_id' => $head->id,
            ],
            [
                'key' => 'timekeeper',
                'employee_no' => 'DEMO-0005',
                'first_name' => 'Ella', 'last_name' => 'Mendoza',
                'gender' => 'female', 'birth_date' => '1995-05-19',
                'email_company' => 'ella.mendoza@demo.meatplus.ph',
                'branch_id' => $plant->id,
                'department_id' => $org['OPS']['dept']->id,
                'position_id' => $org['OPS']['staff']->id,
                'employment_type_id' => $types['REG']->id,
                'date_hired' => '2023-01-09',
                'date_regularized' => '2023-07-09',
                'manager_employee_id' => $head->id,
            ],
            [
                // Probationary, and deliberately has no login: exercises the
                // HR-only employee record + the invite flow.
                'key' => 'nologin',
                'employee_no' => 'DEMO-0006',
                'first_name' => 'Fred', 'last_name' => 'Villanueva',
                'gender' => 'male', 'birth_date' => '2000-07-07',
                'email_company' => 'fred.villanueva@demo.meatplus.ph',
                'branch_id' => $ho->id,
                'department_id' => $org['IT']['dept']->id,
                'position_id' => $org['IT']['staff']->id,
                'employment_type_id' => $types['PROB']->id,
                'date_hired' => Carbon::today()->subMonths(2)->toDateString(),
                'expected_regularization_date' => Carbon::today()->addMonths(4)->toDateString(),
            ],
        ];

        $employees = ['head' => $head];
        foreach ($rows as $row) {
            $key = $row['key'];
            unset($row['key']);
            $employees[$key] = $this->employee($company, $row);
        }

        return $employees;
    }

    private function employee(Company $company, array $attrs): Employee
    {
        return Employee::firstOrCreate(
            ['company_id' => $company->id, 'employee_no' => $attrs['employee_no']],
            array_merge([
                'civil_status' => 'single',
                'nationality' => 'Filipino',
                'city' => 'Quezon City',
                'province' => 'Metro Manila',
                'country' => 'Philippines',
                'is_active' => true,
            ], $attrs),
        );
    }

    /**
     * One login per role worth testing. Usernames are short on purpose — testers
     * type them at the sign-in box, which accepts a username or an email.
     *
     * @param  array<string, Employee>  $employees
     */
    private function logins(Company $company, array $employees): void
    {
        $accounts = [
            ['employee' => $employees['hr'], 'username' => 'demo.hr', 'role' => 'hr_officer'],
            ['employee' => $employees['payroll'], 'username' => 'demo.payroll', 'role' => 'payroll_officer'],
            ['employee' => $employees['head'], 'username' => 'demo.head', 'role' => 'dept_head'],
            ['employee' => $employees['timekeeper'], 'username' => 'demo.timekeeper', 'role' => 'timekeeper'],
            ['employee' => $employees['staff'], 'username' => 'demo.employee', 'role' => 'employee'],
        ];

        foreach ($accounts as $a) {
            $this->login($company, $a['employee'], $a['username'], $a['role']);
        }
    }

    private function login(Company $company, Employee $employee, string $username, string $role): void
    {
        $user = User::firstOrCreate(
            ['email' => $employee->email_company],
            [
                'name' => $employee->full_name,
                'username' => $username,
                'password' => Hash::make(self::PASSWORD),
                'is_active' => true,
                'active_company_id' => $company->id,
            ],
        );

        // Demo accounts belong to DEMO and nothing else.
        $user->companies()->syncWithoutDetaching([$company->id => ['is_default' => true]]);

        // Everyone keeps the baseline `employee` role on top of their function,
        // matching what SwitchCompanyController grants on a real company switch.
        $user->syncRoles(array_unique([$role, 'employee']));

        if ($employee->user_id !== $user->id) {
            $employee->forceFill(['user_id' => $user->id])->save();
        }
    }

    /**
     * Round-number salaries — the point is that a payroll run produces sensible
     * numbers, not that they match anyone real.
     *
     * @param  array<string, Employee>  $employees
     */
    private function compensation(Company $company, array $employees): void
    {
        $pay = [
            'head' => ['basic' => 65000, 'allowance' => 5000],
            'hr' => ['basic' => 38000, 'allowance' => 2500],
            'payroll' => ['basic' => 42000, 'allowance' => 2500],
            'staff' => ['basic' => 25000, 'allowance' => 1500],
            'timekeeper' => ['basic' => 28000, 'allowance' => 1500],
            'nologin' => ['basic' => 20000, 'allowance' => 1000],
        ];

        foreach ($pay as $key => $amounts) {
            $employee = $employees[$key];

            EmployeeCompensation::firstOrCreate(
                ['company_id' => $company->id, 'employee_id' => $employee->id, 'is_active' => true],
                [
                    'basic_monthly' => $amounts['basic'],
                    'pay_type' => 'monthly',
                    'daily_rate' => null,
                    'allowance_monthly' => $amounts['allowance'],
                    'effective_from' => $employee->date_hired,
                ],
            );

            EmployeePayrollProfile::firstOrCreate(
                ['employee_id' => $employee->id],
                [
                    'work_days_per_year' => 261,
                    'work_hours_per_day' => 8,
                    'is_minimum_wage_earner' => false,
                    'is_rohq' => false,
                    'has_previous_employment' => false,
                    // 'system' = derive from the statutory tables, not a fixed amount
                    'sss_contribution_mode' => 'system',
                    'philhealth_contribution_mode' => 'system',
                    'hdmf_contribution_mode' => 'system',
                ],
            );
        }
    }

    /**
     * Open the current year with the full credit so leave filing works out of
     * the box, with a little already used so the balance display isn't trivial.
     *
     * @param  array<string, Employee>  $employees
     * @param  array<string, LeaveType>  $leaveTypes
     */
    private function leaveBalances(array $employees, array $leaveTypes): void
    {
        $year = (int) Carbon::today()->year;

        foreach ($employees as $employee) {
            foreach ($leaveTypes as $code => $type) {
                if ($code === 'LWOP') {
                    continue; // unpaid — no credits to track
                }

                LeaveBalance::firstOrCreate(
                    ['employee_id' => $employee->id, 'leave_type_id' => $type->id, 'year' => $year],
                    [
                        'opening_balance' => $type->default_credits_per_year,
                        'accrued' => 0,
                        'granted_adhoc' => 0,
                        'used' => $code === 'VL' ? 2 : 0,
                        'carried_over_to_next' => 0,
                    ],
                );
            }
        }
    }

    /**
     * Put everyone on the standard schedule and back-fill 90 days of biometric
     * punches, then compute the DTRs — so attendance, payroll and reports all
     * have something to chew on the moment a tester logs in.
     *
     * @param  array<string, Employee>  $employees
     */
    private function attendance(array $employees, WorkSchedule $schedule): void
    {
        $from = Carbon::today()->subDays(90);
        $to = Carbon::today();

        foreach ($employees as $employee) {
            EmployeeSchedule::firstOrCreate(
                ['employee_id' => $employee->id, 'work_schedule_id' => $schedule->id],
                ['effective_from' => $employee->date_hired ?? '2024-01-01', 'effective_to' => null],
            );

            $this->generatePunches($employee, $from, $to);
        }
    }

    /** Mon-Fri in/out punches with realistic jitter. Skips if already generated. */
    private function generatePunches(Employee $employee, Carbon $from, Carbon $to): void
    {
        if (TimeLog::where('employee_id', $employee->id)->exists()) {
            return;
        }

        $start = $employee->date_hired && $employee->date_hired->gt($from)
            ? Carbon::parse($employee->date_hired)
            : $from->copy();

        $rows = [];
        for ($day = $start->copy(); $day->lte($to); $day->addDay()) {
            if ($day->isWeekend()) {
                continue;
            }
            if (mt_rand(1, 100) <= 6) {
                continue; // ~6% absent
            }

            $in = $day->copy()->setTime(8, 0)->addMinutes(mt_rand(-10, 25));  // sometimes late
            $out = $day->copy()->setTime(17, 0)->addMinutes(mt_rand(-5, 45)); // sometimes OT/undertime

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

        if (! $rows) {
            return;
        }

        TimeLog::insert($rows);
        app(DtrComputer::class)->computeForEmployee(
            $employee,
            CarbonImmutable::parse($start->toDateString()),
            CarbonImmutable::parse($to->toDateString()),
        );
    }
}
