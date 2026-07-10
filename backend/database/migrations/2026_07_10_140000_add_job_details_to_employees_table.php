<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Job-detail fields from the Sprout HR reference form.
     *
     * Note: "Employment Status" (Regular / Probationary / ...) is NOT added here.
     * It already exists as `employment_type_id` -> employment_types, whose rows
     * are exactly those values.
     */
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('employee_type', 30)->nullable()->after('employment_type_id');
            $table->string('user_type', 20)->nullable()->after('employee_type');
            $table->string('job_code', 50)->nullable()->after('user_type');
            $table->string('job_grade', 30)->nullable()->after('job_code');
            $table->string('client_name', 150)->nullable()->after('job_grade');
            $table->string('billability', 20)->nullable()->after('client_name');
            $table->string('designated_workplace', 150)->nullable()->after('billability');
            $table->date('expected_regularization_date')->nullable()->after('date_hired');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'employee_type', 'user_type', 'job_code', 'job_grade',
                'client_name', 'billability', 'designated_workplace',
                'expected_regularization_date',
            ]);
        });
    }
};
