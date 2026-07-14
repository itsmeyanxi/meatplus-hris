<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Guarantee at most one active compensation row per employee at the DB level, so
// PayrollComputer / Employee::compensation() can never pick an ambiguous salary.
// Postgres partial unique index (the app runs on Postgres); no-op on other drivers.
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // Defensively demote any older active rows, keeping the newest per employee.
        DB::statement(<<<'SQL'
            UPDATE employee_compensations SET is_active = false
            WHERE is_active = true AND id NOT IN (
                SELECT DISTINCT ON (employee_id) id
                FROM employee_compensations
                WHERE is_active = true
                ORDER BY employee_id, effective_from DESC NULLS LAST, id DESC
            )
        SQL);

        DB::statement(
            'CREATE UNIQUE INDEX IF NOT EXISTS employee_compensations_one_active_per_employee '
            . 'ON employee_compensations (employee_id) WHERE is_active'
        );
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS employee_compensations_one_active_per_employee');
        }
    }
};
