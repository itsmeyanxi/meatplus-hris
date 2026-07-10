<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An employee can be assigned to several worksites.
     *
     * `employees.branch_id` stays as the *primary* location: DTR computation,
     * reports and the employee list all read it, and making it nullable would
     * ripple through the app. The row flagged is_primary here mirrors it.
     */
    public function up(): void
    {
        Schema::create('employee_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->string('designated_workplace', 150)->nullable();
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            $table->unique(['employee_id', 'branch_id']);
            $table->index(['employee_id', 'is_primary']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_locations');
    }
};
