<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Contact Information holds three lists in the reference form.
     *
     * The single-value columns on `employees` (mobile, phone_home, email_personal,
     * email_company, address_line1..) stay as they are: DTR, payroll and the CSV
     * importer all read them. These tables are additional channels, not a
     * replacement -- the primary email row mirrors email_personal.
     */
    public function up(): void
    {
        Schema::create('employee_phones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('title', 60);            // Home, Office, Spouse…
            $table->string('contact_no', 50);
            $table->string('contact_name', 150)->nullable();
            $table->timestamps();

            $table->index('employee_id');
        });

        Schema::create('employee_emails', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('email', 255);
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            $table->unique(['employee_id', 'email']);
            $table->index(['employee_id', 'is_primary']);
        });

        Schema::create('employee_addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('label', 40)->default('present'); // present | permanent | other
            $table->string('address_line1', 255);
            $table->string('address_line2', 255)->nullable();
            $table->string('city', 100)->nullable();
            $table->string('province', 100)->nullable();
            $table->string('postal_code', 20)->nullable();
            $table->string('country', 100)->default('Philippines');
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            $table->index(['employee_id', 'is_primary']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_addresses');
        Schema::dropIfExists('employee_emails');
        Schema::dropIfExists('employee_phones');
    }
};
