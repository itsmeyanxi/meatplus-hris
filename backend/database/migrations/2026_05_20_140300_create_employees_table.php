<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('employee_no', 30);

            $table->string('first_name', 100);
            $table->string('middle_name', 100)->nullable();
            $table->string('last_name', 100);
            $table->string('suffix', 20)->nullable();

            $table->date('birth_date');
            $table->string('gender', 20);
            $table->string('civil_status', 20);
            $table->string('nationality', 50)->default('Filipino');
            $table->string('religion', 50)->nullable();

            $table->string('email_personal')->nullable();
            $table->string('email_company')->nullable();
            $table->string('mobile', 50)->nullable();
            $table->string('phone_home', 50)->nullable();

            // current address
            $table->string('address_line1')->nullable();
            $table->string('address_line2')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('province', 100)->nullable();
            $table->string('postal_code', 20)->nullable();
            $table->string('country', 100)->default('Philippines');

            // permanent address
            $table->string('permanent_address_line1')->nullable();
            $table->string('permanent_address_line2')->nullable();
            $table->string('permanent_city', 100)->nullable();
            $table->string('permanent_province', 100)->nullable();
            $table->string('permanent_postal_code', 20)->nullable();
            $table->string('permanent_country', 100)->nullable();

            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->foreignId('department_id')->constrained()->restrictOnDelete();
            $table->foreignId('position_id')->constrained()->restrictOnDelete();
            $table->foreignId('employment_type_id')->constrained()->restrictOnDelete();
            $table->foreignId('manager_employee_id')->nullable()
                ->constrained('employees')->nullOnDelete();

            $table->date('date_hired');
            $table->date('date_regularized')->nullable();
            $table->date('date_separated')->nullable();
            $table->string('separation_reason', 150)->nullable();

            $table->boolean('is_active')->default(true);
            $table->string('photo_path')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->unique(['company_id', 'employee_no']);
            $table->index('is_active');
            $table->index('last_name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
