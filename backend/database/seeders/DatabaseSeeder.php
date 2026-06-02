<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            CompanySeeder::class,
            PermissionsSeeder::class,
            SuperAdminSeeder::class,
            EmployeeUsersSeeder::class,
            OrgStructureSeeder::class,
            AttendanceSeeder::class,
        ]);
    }
}
