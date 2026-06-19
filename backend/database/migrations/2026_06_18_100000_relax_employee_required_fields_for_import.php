<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Make the fields a bulk import may not have nullable, so partial employee
 * records (e.g. from a CSV with only names + department) can be created and
 * completed by HR later. FK columns keep their constraints; only nullability
 * changes (raw ALTER keeps the foreign keys intact on MySQL).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE employees MODIFY birth_date DATE NULL');
        DB::statement('ALTER TABLE employees MODIFY date_hired DATE NULL');
        DB::statement('ALTER TABLE employees MODIFY gender VARCHAR(20) NULL');
        DB::statement('ALTER TABLE employees MODIFY civil_status VARCHAR(20) NULL');
        DB::statement('ALTER TABLE employees MODIFY branch_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE employees MODIFY department_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE employees MODIFY position_id BIGINT UNSIGNED NULL');
        DB::statement('ALTER TABLE employees MODIFY employment_type_id BIGINT UNSIGNED NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE employees MODIFY birth_date DATE NOT NULL');
        DB::statement('ALTER TABLE employees MODIFY date_hired DATE NOT NULL');
        DB::statement('ALTER TABLE employees MODIFY gender VARCHAR(20) NOT NULL');
        DB::statement('ALTER TABLE employees MODIFY civil_status VARCHAR(20) NOT NULL');
        DB::statement('ALTER TABLE employees MODIFY branch_id BIGINT UNSIGNED NOT NULL');
        DB::statement('ALTER TABLE employees MODIFY department_id BIGINT UNSIGNED NOT NULL');
        DB::statement('ALTER TABLE employees MODIFY position_id BIGINT UNSIGNED NOT NULL');
        DB::statement('ALTER TABLE employees MODIFY employment_type_id BIGINT UNSIGNED NOT NULL');
    }
};
