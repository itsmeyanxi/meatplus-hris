<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('final_pays', function (Blueprint $table) {
            $table->string('cancellation_reason')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('final_pays', function (Blueprint $table) {
            $table->dropColumn('cancellation_reason');
        });
    }
};
