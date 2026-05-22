<?php

namespace Database\Seeders;

use App\Domain\HRIS\Models\Department;
use App\Domain\HRIS\Models\EmploymentType;
use App\Domain\HRIS\Models\Position;
use App\Domain\Identity\Models\Company;
use Illuminate\Database\Seeder;

class OrgStructureSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::where('code', 'MPP-MAIN')->firstOrFail();

        $employmentTypes = [
            ['code' => 'REG', 'name' => 'Regular', 'is_regular' => true],
            ['code' => 'PROB', 'name' => 'Probationary', 'is_regular' => false],
            ['code' => 'PROJ', 'name' => 'Project-Based', 'is_regular' => false],
            ['code' => 'CASUAL', 'name' => 'Casual', 'is_regular' => false],
            ['code' => 'CONTRACT', 'name' => 'Contractual', 'is_regular' => false],
            ['code' => 'INTERN', 'name' => 'Intern', 'is_regular' => false],
        ];

        foreach ($employmentTypes as $et) {
            EmploymentType::firstOrCreate(
                ['company_id' => $company->id, 'code' => $et['code']],
                ['name' => $et['name'], 'is_regular' => $et['is_regular'], 'is_active' => true],
            );
        }

        $departments = [
            ['code' => 'EXEC', 'name' => 'Executive Office'],
            ['code' => 'HR', 'name' => 'Human Resources'],
            ['code' => 'FIN', 'name' => 'Finance & Accounting'],
            ['code' => 'IT', 'name' => 'Information Technology'],
            ['code' => 'OPS', 'name' => 'Operations'],
        ];

        foreach ($departments as $d) {
            $dept = Department::firstOrCreate(
                ['company_id' => $company->id, 'code' => $d['code']],
                ['name' => $d['name'], 'is_active' => true],
            );

            Position::firstOrCreate(
                ['company_id' => $company->id, 'department_id' => $dept->id, 'title' => $d['name'].' Staff'],
                ['is_active' => true],
            );
        }
    }
}
