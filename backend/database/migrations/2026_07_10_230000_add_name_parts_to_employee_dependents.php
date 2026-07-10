<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The reference captures First / Middle / Last separately, plus gender and notes.
     *
     * `full_name` is kept and stays NOT NULL: it is what the tax-exemption and BIR
     * reporting read. DependentRequest composes it from the parts, so the two can
     * never drift. The table has no rows, so the new columns need no backfill.
     */
    public function up(): void
    {
        Schema::table('employee_dependents', function (Blueprint $table) {
            $table->string('first_name', 100)->nullable()->after('employee_id');
            $table->string('middle_name', 100)->nullable()->after('first_name');
            $table->string('last_name', 100)->nullable()->after('middle_name');
            $table->string('gender', 10)->nullable()->after('birth_date');
            $table->string('notes', 500)->nullable()->after('is_qualified_for_tax_exemption');
        });
    }

    public function down(): void
    {
        Schema::table('employee_dependents', function (Blueprint $table) {
            $table->dropColumn(['first_name', 'middle_name', 'last_name', 'gender', 'notes']);
        });
    }
};
