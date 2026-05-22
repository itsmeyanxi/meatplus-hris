<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('legal_name');
            $table->string('trade_name')->nullable();

            $table->text('tin')->nullable();
            $table->text('sss_employer_no')->nullable();
            $table->text('philhealth_employer_no')->nullable();
            $table->text('pagibig_employer_no')->nullable();

            $table->string('rdo_code', 10)->nullable();

            $table->string('address_line1')->nullable();
            $table->string('address_line2')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('province', 100)->nullable();
            $table->string('postal_code', 20)->nullable();
            $table->string('country', 100)->default('Philippines');

            $table->string('contact_email')->nullable();
            $table->string('contact_phone', 50)->nullable();
            $table->string('logo_path')->nullable();

            $table->boolean('is_active')->default(true);

            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('companies');
    }
};
