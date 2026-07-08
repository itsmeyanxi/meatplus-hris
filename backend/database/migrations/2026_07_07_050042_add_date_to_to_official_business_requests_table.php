<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('official_business_requests', function (Blueprint $table) {
            $table->date('date_to')->nullable()->after('date');
        });
    }

    public function down(): void
    {
        Schema::table('official_business_requests', function (Blueprint $table) {
            $table->dropColumn('date_to');
        });
    }
};
