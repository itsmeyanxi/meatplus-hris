<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `employee_compensations` carried a UNIQUE index on employee_id, so it could
     * hold exactly one salary per employee — which is why the controller used
     * updateOrCreate and every raise overwrote the previous figure. The
     * effective_from and is_active columns were therefore dead.
     *
     * Drop the unique index so the table can be what its columns imply: a salary
     * history. Employee::compensation() now selects the newest active row, and the
     * controller closes the outgoing record before appending the new one.
     *
     * The table has no rows, so nothing needs reconciling.
     */
    public function up(): void
    {
        Schema::table('employee_compensations', function (Blueprint $table) {
            $table->dropUnique('employee_compensations_employee_id_unique');
            $table->index(['employee_id', 'is_active']);
            $table->index(['employee_id', 'effective_from']);
        });
    }

    public function down(): void
    {
        Schema::table('employee_compensations', function (Blueprint $table) {
            $table->dropIndex(['employee_id', 'is_active']);
            $table->dropIndex(['employee_id', 'effective_from']);
            $table->unique('employee_id');
        });
    }
};
