<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `visa_number` is `text`, not varchar: it is encrypted at rest like
     * passport_no and the government IDs, and Laravel's ciphertext is far longer
     * than the plain value. A varchar would silently truncate it, making the
     * value permanently undecryptable.
     */
    public function up(): void
    {
        Schema::create('employee_visas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('visa_type', 60);
            $table->text('visa_number');
            $table->date('issue_date')->nullable();
            $table->date('expiration_date')->nullable();
            $table->string('place_of_issue', 150)->nullable();
            $table->string('notes', 500)->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'expiration_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_visas');
    }
};
