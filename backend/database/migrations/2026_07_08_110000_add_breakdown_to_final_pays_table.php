<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('final_pays', function (Blueprint $table) {
            // Stores the full itemized earnings and deductions as entered by HR
            $table->json('earnings_breakdown')->nullable()->after('other_earnings_note');
            $table->json('deductions_breakdown')->nullable()->after('other_deductions_note');
        });
    }

    public function down(): void
    {
        Schema::table('final_pays', function (Blueprint $table) {
            $table->dropColumn(['earnings_breakdown', 'deductions_breakdown']);
        });
    }
};
