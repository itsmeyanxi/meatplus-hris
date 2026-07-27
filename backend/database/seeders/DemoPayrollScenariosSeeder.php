<?php

namespace Database\Seeders;

use App\Domain\Attendance\Models\EmployeeSchedule;
use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Models\WorkSchedule;
use App\Domain\Attendance\Models\WorkScheduleDay;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Department;
use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeBankAccount;
use App\Domain\HRIS\Models\EmployeeGovernmentId;
use App\Domain\HRIS\Models\EmploymentType;
use App\Domain\HRIS\Models\Position;
use App\Domain\Identity\Models\Branch;
use App\Domain\Identity\Models\Company;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\EmployeePayrollProfile;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Spatie\Permission\PermissionRegistrar;

/**
 * Enriches the DEMO sandbox with a realistic, payroll-exercising workforce so a
 * tester can generate a run that hits every code path. Modeled on the real
 * poultry business: monthly office staff + daily farm workers, plus a few
 * shapes the real data doesn't have but the system supports (hourly part-time,
 * field personnel, exempted supervisors, night shift for night-differential).
 *
 * On top of that it back-fills bank accounts + government IDs for EVERY demo
 * employee (the original six had none) so bank files and statutory reports work.
 *
 *     php artisan db:seed --class=DemoPayrollScenariosSeeder
 *
 * Idempotent — safe to re-run. Requires DemoCompanySeeder to have run first
 * (it owns the DEMO company, branches and standard schedule).
 */
class DemoPayrollScenariosSeeder extends Seeder
{
    private const CODE = 'DEMO';

    public function run(): void
    {
        $company = Company::where('code', self::CODE)->first();
        if (! $company) {
            $this->command?->warn('DEMO company not found — run DemoCompanySeeder first.');

            return;
        }
        app(PermissionRegistrar::class)->setPermissionsTeamId($company->id);

        $ho = Branch::where('company_id', $company->id)->where('code', 'HO')->first();
        $plant = Branch::where('company_id', $company->id)->where('code', 'PLANT')->first() ?? $ho;
        $reg = EmploymentType::where('company_id', $company->id)->where('code', 'REG')->first();
        $contract = EmploymentType::where('company_id', $company->id)->where('code', 'CONTRACT')->first() ?? $reg;
        $prob = EmploymentType::where('company_id', $company->id)->where('code', 'PROB')->first() ?? $reg;

        // Departments modeled on the real poultry operation.
        $prod = $this->dept($company, 'PROD', 'Production / Farm Operations');
        $hatch = $this->dept($company, 'HATCH', 'Hatchery');
        $qa = $this->dept($company, 'QA', 'Quality Assurance');
        $whse = $this->dept($company, 'WHSE', 'Warehouse & Logistics');
        $acct = $this->dept($company, 'ACCT', 'Accounting');

        // Schedules: office (reuse standard), Mon-Sat farm day shift, overnight
        // night shift, and a half-day part-time pattern.
        $office = WorkSchedule::where('company_id', $company->id)->where('code', 'STD-MF-8-5')->first();
        $farm = $this->schedule($company, 'FARM-MS-7-4', 'Farm Mon-Sat 7:00 AM - 4:00 PM', 6, '07:00:00', '16:00:00', 8);
        $night = $this->schedule($company, 'NIGHT-MS-10-7', 'Night Mon-Sat 10:00 PM - 7:00 AM', 6, '22:00:00', '07:00:00', 8);
        $partTime = $this->schedule($company, 'PT-MF-4H', 'Part-time Mon-Fri 8:00 AM - 12:00 NN', 5, '08:00:00', '12:00:00', 4);

        // The roster. sched: 'office'|'farm'|'night'|'part'|'none' (none = exempted/field, no punches).
        $roster = [
            // Daily-rate farm workers (the real majority) — Mon-Sat.
            ['no' => 'DEMO-1001', 'first' => 'Rogelio', 'last' => 'Manalo', 'g' => 'male', 'birth' => '1988-04-12', 'dept' => $prod, 'pos' => 'Poultry Farm Worker', 'br' => $plant, 'et' => $reg, 'st' => 'regular', 'pay' => 'daily', 'rate' => 645, 'sched' => 'farm'],
            ['no' => 'DEMO-1002', 'first' => 'Efren', 'last' => 'Delos Santos', 'g' => 'male', 'birth' => '1991-08-25', 'dept' => $prod, 'pos' => 'Poultry Farm Worker', 'br' => $plant, 'et' => $reg, 'st' => 'regular', 'pay' => 'daily', 'rate' => 645, 'sched' => 'farm'],
            ['no' => 'DEMO-1003', 'first' => 'Marites', 'last' => 'Gonzales', 'g' => 'female', 'birth' => '1994-01-30', 'dept' => $hatch, 'pos' => 'Hatchery Staff', 'br' => $plant, 'et' => $reg, 'st' => 'regular', 'pay' => 'daily', 'rate' => 630, 'sched' => 'farm'],
            ['no' => 'DEMO-1004', 'first' => 'Danilo', 'last' => 'Ramos', 'g' => 'male', 'birth' => '1985-12-03', 'dept' => $hatch, 'pos' => 'Hatchery Staff', 'br' => $plant, 'et' => $reg, 'st' => 'regular', 'pay' => 'daily', 'rate' => 630, 'sched' => 'farm'],
            ['no' => 'DEMO-1005', 'first' => 'Joel', 'last' => 'Aquino', 'g' => 'male', 'birth' => '1990-06-18', 'dept' => $prod, 'pos' => 'Flockman', 'br' => $plant, 'et' => $reg, 'st' => 'regular', 'pay' => 'daily', 'rate' => 660, 'sched' => 'farm'],
            ['no' => 'DEMO-1006', 'first' => 'Arnel', 'last' => 'Bautista', 'g' => 'male', 'birth' => '1987-02-22', 'dept' => $prod, 'pos' => 'Mason/Carpenter', 'br' => $plant, 'et' => $contract, 'st' => 'regular', 'pay' => 'daily', 'rate' => 610, 'sched' => 'farm'],
            ['no' => 'DEMO-1007', 'first' => 'Rowena', 'last' => 'Castillo', 'g' => 'female', 'birth' => '1996-09-14', 'dept' => $hatch, 'pos' => 'Hatchery Staff', 'br' => $plant, 'et' => $contract, 'st' => 'regular', 'pay' => 'daily', 'rate' => 620, 'sched' => 'farm'],

            // Night-shift farm workers — for night-differential testing.
            ['no' => 'DEMO-1008', 'first' => 'Bienvenido', 'last' => 'Flores', 'g' => 'male', 'birth' => '1989-11-08', 'dept' => $prod, 'pos' => 'Poultry Farm Worker (Night)', 'br' => $plant, 'et' => $reg, 'st' => 'shifting', 'pay' => 'daily', 'rate' => 665, 'sched' => 'night'],
            ['no' => 'DEMO-1009', 'first' => 'Cristina', 'last' => 'Villar', 'g' => 'female', 'birth' => '1993-03-27', 'dept' => $prod, 'pos' => 'Poultry Farm Worker (Night)', 'br' => $plant, 'et' => $reg, 'st' => 'shifting', 'pay' => 'daily', 'rate' => 665, 'sched' => 'night'],

            // Monthly office / supervisory staff.
            ['no' => 'DEMO-1010', 'first' => 'Ferdinand', 'last' => 'Reyes', 'g' => 'male', 'birth' => '1982-07-05', 'dept' => $prod, 'pos' => 'Production Supervisor', 'br' => $plant, 'et' => $reg, 'st' => 'regular', 'pay' => 'monthly', 'rate' => 32000, 'allow' => 2500, 'sched' => 'office'],
            ['no' => 'DEMO-1011', 'first' => 'Grace', 'last' => 'Tolentino', 'g' => 'female', 'birth' => '1990-10-19', 'dept' => $qa, 'pos' => 'Quality Assurance Inspector', 'br' => $plant, 'et' => $reg, 'st' => 'regular', 'pay' => 'monthly', 'rate' => 26000, 'allow' => 2000, 'sched' => 'office'],
            ['no' => 'DEMO-1012', 'first' => 'Michael', 'last' => 'Ocampo', 'g' => 'male', 'birth' => '1992-05-11', 'dept' => $acct, 'pos' => 'Accounting Analyst', 'br' => $ho, 'et' => $reg, 'st' => 'regular', 'pay' => 'monthly', 'rate' => 28000, 'allow' => 2000, 'sched' => 'office'],
            ['no' => 'DEMO-1013', 'first' => 'Jessica', 'last' => 'Navarro', 'g' => 'female', 'birth' => '1995-08-02', 'dept' => $whse, 'pos' => 'Purchasing Assistant', 'br' => $ho, 'et' => $reg, 'st' => 'regular', 'pay' => 'monthly', 'rate' => 23000, 'allow' => 1500, 'sched' => 'office'],
            ['no' => 'DEMO-1014', 'first' => 'Roberto', 'last' => 'Salazar', 'g' => 'male', 'birth' => '1986-01-16', 'dept' => $whse, 'pos' => 'Warehouse Supervisor', 'br' => $plant, 'et' => $reg, 'st' => 'regular', 'pay' => 'monthly', 'rate' => 30000, 'allow' => 2500, 'sched' => 'office'],
            ['no' => 'DEMO-1015', 'first' => 'Angelica', 'last' => 'Domingo', 'g' => 'female', 'birth' => '1998-12-09', 'dept' => $prod, 'pos' => 'Farm Management Trainee', 'br' => $plant, 'et' => $prob, 'st' => 'regular', 'pay' => 'monthly', 'rate' => 18000, 'allow' => 1000, 'sched' => 'office'],

            // Exempted (always present, no punches) — managers/supervisors.
            ['no' => 'DEMO-1016', 'first' => 'Eduardo', 'last' => 'Mercado', 'g' => 'male', 'birth' => '1978-03-21', 'dept' => $prod, 'pos' => 'Farm Manager', 'br' => $plant, 'et' => $reg, 'st' => 'exempted', 'pay' => 'monthly', 'rate' => 68000, 'allow' => 6000, 'sched' => 'none', 'conf' => true],
            ['no' => 'DEMO-1017', 'first' => 'Teresita', 'last' => 'Lim', 'g' => 'female', 'birth' => '1975-09-30', 'dept' => $acct, 'pos' => 'Operations Manager', 'br' => $ho, 'et' => $reg, 'st' => 'exempted', 'pay' => 'monthly', 'rate' => 92000, 'allow' => 8000, 'sched' => 'none', 'conf' => true],
            ['no' => 'DEMO-1018', 'first' => 'Renato', 'last' => 'Padilla', 'g' => 'male', 'birth' => '1980-06-07', 'dept' => $hatch, 'pos' => 'Hatchery Supervisor', 'br' => $plant, 'et' => $reg, 'st' => 'exempted', 'pay' => 'monthly', 'rate' => 34000, 'allow' => 3000, 'sched' => 'none'],

            // Field personnel (no punches) — sales/delivery.
            ['no' => 'DEMO-1019', 'first' => 'Noel', 'last' => 'Fernandez', 'g' => 'male', 'birth' => '1991-04-25', 'dept' => $whse, 'pos' => 'Field Sales Representative', 'br' => $ho, 'et' => $reg, 'st' => 'field', 'pay' => 'monthly', 'rate' => 24000, 'allow' => 3500, 'sched' => 'none'],

            // Part-time hourly.
            ['no' => 'DEMO-1020', 'first' => 'Katrina', 'last' => 'Rosales', 'g' => 'female', 'birth' => '2001-02-14', 'dept' => $acct, 'pos' => 'Office Assistant (Part-time)', 'br' => $ho, 'et' => $contract, 'st' => 'part_time', 'pay' => 'hourly', 'rate' => 95, 'sched' => 'part'],
            ['no' => 'DEMO-1021', 'first' => 'Paolo', 'last' => 'Guevarra', 'g' => 'male', 'birth' => '2000-11-20', 'dept' => $qa, 'pos' => 'Lab Aide (Part-time)', 'br' => $plant, 'et' => $contract, 'st' => 'part_time', 'pay' => 'hourly', 'rate' => 90, 'sched' => 'part'],

            // High earner — exercises the top tax bracket.
            ['no' => 'DEMO-1022', 'first' => 'Alexandra', 'last' => 'Yulo', 'g' => 'female', 'birth' => '1972-05-03', 'dept' => $acct, 'pos' => 'General Manager', 'br' => $ho, 'et' => $reg, 'st' => 'exempted', 'pay' => 'monthly', 'rate' => 185000, 'allow' => 15000, 'sched' => 'none', 'conf' => true],
        ];

        // Fill out to ~100 employees with procedurally-generated staff that follow
        // the real farm-business mix (mostly daily farm workers + monthly office).
        $roster = array_merge($roster, $this->fillerRoster(1023, 100 - count($roster), [
            'prod' => $prod, 'hatch' => $hatch, 'qa' => $qa, 'whse' => $whse, 'acct' => $acct,
            'plant' => $plant, 'ho' => $ho, 'reg' => $reg, 'contract' => $contract, 'prob' => $prob,
        ]));

        $created = 0;
        foreach ($roster as $r) {
            $emp = $this->employee($company, $r);
            $this->compensation($company, $emp, $r);
            $this->bankAndGov($emp, $created);
            $this->assignSchedule($emp, $r, compact('office', 'farm', 'night', 'partTime'));
            $created++;
        }

        // Back-fill bank + gov for the ORIGINAL six demo employees (they had none).
        $existing = Employee::where('company_id', $company->id)
            ->where('employee_no', 'like', 'DEMO-000%')->get();
        foreach ($existing as $i => $emp) {
            $this->bankAndGov($emp, 100 + $i);
        }

        // Generate July attendance for the new punching employees, then compute
        // DTRs for the whole month so both semi-monthly cutoffs have data.
        $julyFrom = Carbon::parse('2026-07-01');
        $julyTo = Carbon::parse('2026-07-31');
        foreach ($roster as $r) {
            $emp = Employee::where('company_id', $company->id)->where('employee_no', $r['no'])->first();
            if (! $emp) {
                continue;
            }
            if ($r['sched'] !== 'none') {
                $this->generatePunches($emp, $r['sched'], $julyFrom, $julyTo);
            }
            app(DtrComputer::class)->computeForEmployee(
                $emp,
                CarbonImmutable::parse($julyFrom->toDateString()),
                CarbonImmutable::parse($julyTo->toDateString()),
            );
        }

        $this->command?->info("DEMO enriched: {$created} new employees + bank/gov for all. Test payroll on Jul 1-15 or Jul 16-31.");
    }

    /**
     * Procedurally generate $count employees to reach a realistic headcount.
     * Deterministic (attributes derived from the index) so re-runs are stable and
     * employee_no stays the idempotency key. Distribution mirrors the real
     * business: ~60% daily farm workers, ~25% monthly office, plus night, part-
     * time, exempted and field in smaller numbers. Some are confidential.
     *
     * @param  array<string,mixed>  $ctx
     * @return array<int,array<string,mixed>>
     */
    private function fillerRoster(int $startNo, int $count, array $ctx): array
    {
        $firstM = ['Juan', 'Jose', 'Pedro', 'Andres', 'Ramon', 'Carlo', 'Marco', 'Vicente', 'Ernesto', 'Manuel', 'Ricardo', 'Alfredo', 'Benjamin', 'Gregorio', 'Lorenzo', 'Nestor', 'Rodel', 'Julius', 'Emmanuel', 'Dexter', 'Jayson', 'Kevin', 'Mark', 'Ryan', 'Christian', 'Allan', 'Jerome', 'Dennis', 'Edgar', 'Warren'];
        $firstF = ['Maria', 'Ana', 'Josefa', 'Luz', 'Carmen', 'Rosa', 'Gloria', 'Elena', 'Corazon', 'Divina', 'Imelda', 'Lorna', 'Nenita', 'Perla', 'Vilma', 'Aileen', 'Charmaine', 'Jocelyn', 'Kristine', 'Michelle', 'Precious', 'Rowena', 'Sheila', 'Trixie', 'Vanessa', 'Wilma', 'Yolanda', 'Zenaida', 'Bianca', 'Camille'];
        $last = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Salazar', 'Domingo', 'Fernandez', 'Gonzales', 'Manalo', 'Padilla', 'Navarro', 'Tolentino', 'Mercado', 'Rosales', 'Guevarra', 'Dela Cruz', 'De Leon', 'Del Rosario', 'Pascual', 'Estrada', 'Marquez', 'Rivera', 'Aguilar', 'Soriano', 'Valdez', 'Ignacio', 'Yap', 'Chua', 'Lim', 'Uy', 'Tan'];

        // template => [dept key, positions, branch key, employment key, schedule_type, sched, pay, rate-range]
        $templates = [
            // weight, spec
            [34, ['dept' => 'prod', 'pos' => ['Poultry Farm Worker', 'Flockman', 'Farm Aide'], 'br' => 'plant', 'et' => 'reg', 'st' => 'regular', 'sched' => 'farm', 'pay' => 'daily', 'min' => 610, 'max' => 670]],
            [18, ['dept' => 'hatch', 'pos' => ['Hatchery Staff', 'Egg Grader', 'Incubation Aide'], 'br' => 'plant', 'et' => 'reg', 'st' => 'regular', 'sched' => 'farm', 'pay' => 'daily', 'min' => 615, 'max' => 655]],
            [8, ['dept' => 'prod', 'pos' => ['Poultry Farm Worker (Night)', 'Flockman (Night)'], 'br' => 'plant', 'et' => 'reg', 'st' => 'shifting', 'sched' => 'night', 'pay' => 'daily', 'min' => 630, 'max' => 685]],
            [7, ['dept' => 'acct', 'pos' => ['Accounting Analyst', 'Payroll Clerk', 'Bookkeeper'], 'br' => 'ho', 'et' => 'reg', 'st' => 'regular', 'sched' => 'office', 'pay' => 'monthly', 'min' => 22000, 'max' => 34000]],
            [7, ['dept' => 'qa', 'pos' => ['Quality Assurance Inspector', 'QA Analyst'], 'br' => 'plant', 'et' => 'reg', 'st' => 'regular', 'sched' => 'office', 'pay' => 'monthly', 'min' => 21000, 'max' => 30000]],
            [7, ['dept' => 'whse', 'pos' => ['Warehouse Staff', 'Purchasing Assistant', 'Inventory Clerk'], 'br' => 'plant', 'et' => 'reg', 'st' => 'regular', 'sched' => 'office', 'pay' => 'monthly', 'min' => 20000, 'max' => 29000]],
            [5, ['dept' => 'prod', 'pos' => ['Farm Management Trainee'], 'br' => 'plant', 'et' => 'prob', 'st' => 'regular', 'sched' => 'office', 'pay' => 'monthly', 'min' => 16000, 'max' => 20000]],
            [4, ['dept' => 'prod', 'pos' => ['Production Supervisor', 'Shift Supervisor'], 'br' => 'plant', 'et' => 'reg', 'st' => 'exempted', 'sched' => 'none', 'pay' => 'monthly', 'min' => 30000, 'max' => 55000, 'conf' => true]],
            [3, ['dept' => 'whse', 'pos' => ['Field Sales Representative', 'Delivery Driver'], 'br' => 'ho', 'et' => 'reg', 'st' => 'field', 'sched' => 'none', 'pay' => 'monthly', 'min' => 22000, 'max' => 28000]],
            [3, ['dept' => 'acct', 'pos' => ['Office Assistant (Part-time)', 'Clerk (Part-time)'], 'br' => 'ho', 'et' => 'contract', 'st' => 'part_time', 'sched' => 'part', 'pay' => 'hourly', 'min' => 88, 'max' => 120]],
        ];

        // Expand weights into a selection table.
        $pick = [];
        foreach ($templates as [$w, $spec]) {
            for ($i = 0; $i < $w; $i++) {
                $pick[] = $spec;
            }
        }

        $out = [];
        for ($i = 0; $i < $count; $i++) {
            $no = $startNo + $i;
            $spec = $pick[($i * 7) % count($pick)];
            $female = ($no % 2) === 0;
            $first = $female ? $firstF[($no * 3) % count($firstF)] : $firstM[($no * 3) % count($firstM)];
            $lastN = $last[($no * 5) % count($last)];
            $pos = $spec['pos'][($no) % count($spec['pos'])];
            $span = $spec['max'] - $spec['min'];
            $rate = $spec['min'] + ($span > 0 ? ($no * 37) % ($span + 1) : 0);
            if ($spec['pay'] === 'daily') {
                $rate = (int) round($rate / 5) * 5; // tidy daily rates
            } elseif ($spec['pay'] === 'monthly') {
                $rate = (int) round($rate / 500) * 500;
            }
            $birthYear = 1972 + ($no * 11) % 32; // 1972..2003
            $birthMonth = 1 + ($no % 12);
            $birthDay = 1 + ($no % 27);

            $out[] = [
                'no' => 'DEMO-'.$no,
                'first' => $first,
                'last' => $lastN,
                'g' => $female ? 'female' : 'male',
                'birth' => sprintf('%04d-%02d-%02d', $birthYear, $birthMonth, $birthDay),
                'dept' => $ctx[$spec['dept']],
                'pos' => $pos,
                'br' => $ctx[$spec['br']],
                'et' => $ctx[$spec['et']],
                'st' => $spec['st'],
                'pay' => $spec['pay'],
                'rate' => $rate,
                'allow' => $spec['pay'] === 'monthly' ? 1500 : 0,
                'sched' => $spec['sched'],
                'conf' => $spec['conf'] ?? false,
            ];
        }

        return $out;
    }

    private function dept(Company $company, string $code, string $name): Department
    {
        return Department::firstOrCreate(
            ['company_id' => $company->id, 'code' => $code],
            ['name' => $name, 'is_active' => true],
        );
    }

    private function position(Company $company, Department $dept, string $title): Position
    {
        return Position::firstOrCreate(
            ['company_id' => $company->id, 'department_id' => $dept->id, 'title' => $title],
            ['is_active' => true],
        );
    }

    private function schedule(Company $company, string $code, string $name, int $workdays, string $in, string $out, int $hours): WorkSchedule
    {
        $overnight = $out < $in;
        $sched = WorkSchedule::firstOrCreate(
            ['company_id' => $company->id, 'code' => $code],
            [
                'name' => $name,
                'description' => $name,
                'is_flexible' => false,
                'breaks_paid' => false,
                'weekly_workdays' => $workdays,
                'is_active' => true,
            ],
        );

        foreach (range(0, 6) as $dow) {
            // Mon-Sat schedules rest on Sunday; Mon-Fri rest Sat+Sun.
            $rest = $dow === 0 || ($workdays <= 5 && $dow === 6);
            WorkScheduleDay::firstOrCreate(
                ['work_schedule_id' => $sched->id, 'day_of_week' => $dow],
                [
                    'is_rest_day' => $rest,
                    'time_in' => $rest ? null : $in,
                    'time_out' => $rest ? null : $out,
                    'break_minutes' => $rest ? 0 : ($hours >= 8 ? 60 : 0),
                    'required_hours' => $rest ? 0 : $hours,
                ],
            );
        }

        return $sched;
    }

    private function employee(Company $company, array $r): Employee
    {
        $dept = $r['dept'];
        $position = $this->position($company, $dept, $r['pos']);

        return Employee::firstOrCreate(
            ['company_id' => $company->id, 'employee_no' => $r['no']],
            [
                'first_name' => $r['first'],
                'last_name' => $r['last'],
                'gender' => $r['g'],
                'birth_date' => $r['birth'],
                'civil_status' => 'single',
                'nationality' => 'Filipino',
                'email_company' => strtolower($r['first'].'.'.str_replace(' ', '', $r['last']).'@demo.meatplus.ph'),
                'mobile' => '0917'.str_pad((string) random_int(1000000, 9999999), 7, '0', STR_PAD_LEFT),
                'city' => 'San Jose del Monte',
                'province' => 'Bulacan',
                'country' => 'Philippines',
                'branch_id' => $r['br']->id,
                'department_id' => $dept->id,
                'position_id' => $position->id,
                'employment_type_id' => $r['et']->id,
                'schedule_type' => $r['st'],
                'is_confidential' => $r['conf'] ?? false,
                'date_hired' => '2023-01-16',
                'date_regularized' => in_array($r['et']->code ?? '', ['REG'], true) ? '2023-07-16' : null,
                'is_active' => true,
            ],
        );
    }

    private function compensation(Company $company, Employee $emp, array $r): void
    {
        // basic_monthly is NOT NULL — keep unused rate fields at 0; PayrollComputer
        // reads the field matching pay_type, so the zeros are inert.
        $monthly = $r['pay'] === 'monthly' ? $r['rate'] : 0;
        $daily = $r['pay'] === 'daily' ? $r['rate'] : 0;
        $hourly = $r['pay'] === 'hourly' ? $r['rate'] : 0;

        EmployeeCompensation::firstOrCreate(
            ['company_id' => $company->id, 'employee_id' => $emp->id, 'is_active' => true],
            [
                'pay_type' => $r['pay'],
                'basic_monthly' => $monthly,
                'daily_rate' => $daily,
                'hourly_rate' => $hourly,
                'allowance_monthly' => $r['allow'] ?? 0,
                'effective_from' => $emp->date_hired ?? '2023-01-16',
            ],
        );

        EmployeePayrollProfile::firstOrCreate(
            ['employee_id' => $emp->id],
            [
                'work_days_per_year' => 261,
                'work_hours_per_day' => 8,
                'is_minimum_wage_earner' => $r['pay'] === 'daily' && $r['rate'] <= 610,
                'is_rohq' => false,
                'has_previous_employment' => false,
                'sss_contribution_mode' => 'system',
                'philhealth_contribution_mode' => 'system',
                'hdmf_contribution_mode' => 'system',
            ],
        );
    }

    /** Bank account + government IDs — via models, so encrypted fields encrypt. */
    private function bankAndGov(Employee $emp, int $seq): void
    {
        $bank = $seq % 2 === 0 ? 'China Bank Savings' : 'BPI';
        EmployeeBankAccount::firstOrCreate(
            ['employee_id' => $emp->id, 'is_primary' => true],
            [
                'bank_name' => $bank,
                'account_number' => str_pad((string) (1000000000 + $emp->id * 7919), 12, '0', STR_PAD_LEFT),
                'account_name' => $emp->full_name,
                'purpose' => 'payroll',
            ],
        );

        $n = $emp->id;
        EmployeeGovernmentId::firstOrCreate(
            ['employee_id' => $emp->id],
            [
                'tin' => sprintf('%03d-%03d-%03d-000', 100 + $n % 900, $n % 1000, ($n * 3) % 1000),
                'sss_no' => sprintf('34-%07d-%d', 1000000 + $n * 31, $n % 10),
                'philhealth_no' => sprintf('12-%09d-%d', 100000000 + $n * 131, $n % 10),
                'pagibig_no' => sprintf('1234-%04d-%04d', ($n * 13) % 10000, ($n * 17) % 10000),
                'rdo_code' => '045',
            ],
        );
    }

    /** @param array{office:WorkSchedule,farm:WorkSchedule,night:WorkSchedule,partTime:WorkSchedule} $s */
    private function assignSchedule(Employee $emp, array $r, array $s): void
    {
        // Exempted / field employees don't punch — but still get a schedule so the
        // DTR knows their required hours to credit them (always-present logic).
        $ws = match ($r['sched']) {
            'farm' => $s['farm'],
            'night' => $s['night'],
            'part' => $s['partTime'],
            default => $r['st'] === 'field' ? $s['office'] : $s['office'],
        };

        EmployeeSchedule::firstOrCreate(
            ['employee_id' => $emp->id, 'work_schedule_id' => $ws->id],
            ['effective_from' => $emp->date_hired ?? '2023-01-16', 'effective_to' => null],
        );
    }

    /**
     * Punches for July with deliberate scenarios baked in: OT, lates, the odd
     * absence, and overnight in/out for the night shift (night differential).
     */
    private function generatePunches(Employee $emp, string $kind, Carbon $from, Carbon $to): void
    {
        if (TimeLog::where('employee_id', $emp->id)->whereBetween('logged_at', [$from, $to->copy()->endOfDay()])->exists()) {
            return;
        }

        [$inH, $inM, $outH, $outM, $sat, $overnight] = match ($kind) {
            'farm' => [7, 0, 16, 0, true, false],
            'night' => [22, 0, 7, 0, true, true],
            'part' => [8, 0, 12, 0, false, false],
            default => [8, 0, 17, 0, false, false], // office
        };

        $rows = [];
        for ($day = $from->copy(); $day->lte($to); $day->addDay()) {
            if ($day->dayOfWeek === Carbon::SUNDAY) {
                continue;
            }
            if (! $sat && $day->dayOfWeek === Carbon::SATURDAY) {
                continue;
            }
            if (mt_rand(1, 100) <= 5) {
                continue; // ~5% absent
            }

            $in = $day->copy()->setTime($inH, $inM)->addMinutes(mt_rand(-8, 22)); // some lates
            $out = ($overnight ? $day->copy()->addDay() : $day->copy())->setTime($outH, $outM)->addMinutes(mt_rand(-5, 50)); // some OT

            foreach ([[$in, 'in'], [$out, 'out']] as [$ts, $dir]) {
                $rows[] = [
                    'company_id' => $emp->company_id,
                    'employee_id' => $emp->id,
                    'logged_at' => $ts->toDateTimeString(),
                    'direction' => $dir,
                    'source' => 'biometric',
                    'device_id' => 'DEMO-DEV-1',
                ];
            }
        }

        if ($rows) {
            TimeLog::insert($rows);
        }
    }
}
