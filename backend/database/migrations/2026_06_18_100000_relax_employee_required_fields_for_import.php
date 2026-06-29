<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Make the fields a bulk import may not have nullable, so partial employee
 * records (e.g. from a CSV with only names + department) can be created and
 * completed by HR later. Driver-aware so it runs on both MySQL and PostgreSQL.
 */
return new class extends Migration
{
    private array $columns = [
        'birth_date' => 'DATE',
        'date_hired' => 'DATE',
        'gender' => 'VARCHAR(20)',
        'civil_status' => 'VARCHAR(20)',
        'branch_id' => 'BIGINT',
        'department_id' => 'BIGINT',
        'position_id' => 'BIGINT',
        'employment_type_id' => 'BIGINT',
    ];

    public function up(): void
    {
        if ($this->isPostgres()) {
            foreach (array_keys($this->columns) as $col) {
                DB::statement("ALTER TABLE employees ALTER COLUMN {$col} DROP NOT NULL");
            }

            return;
        }

        foreach ($this->columns as $col => $type) {
            $mysqlType = $col === 'branch_id' || str_ends_with($col, '_id') ? 'BIGINT UNSIGNED' : $type;
            DB::statement("ALTER TABLE employees MODIFY {$col} {$mysqlType} NULL");
        }
    }

    public function down(): void
    {
        if ($this->isPostgres()) {
            foreach (array_keys($this->columns) as $col) {
                DB::statement("ALTER TABLE employees ALTER COLUMN {$col} SET NOT NULL");
            }

            return;
        }

        foreach ($this->columns as $col => $type) {
            $mysqlType = str_ends_with($col, '_id') ? 'BIGINT UNSIGNED' : $type;
            DB::statement("ALTER TABLE employees MODIFY {$col} {$mysqlType} NOT NULL");
        }
    }

    private function isPostgres(): bool
    {
        return Schema::getConnection()->getDriverName() === 'pgsql';
    }
};
