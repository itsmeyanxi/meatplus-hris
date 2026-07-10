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
        // The earlier add_classification migration was later edited to add this
        // column too, so on a fresh database it already exists by now. Existing
        // databases ran this migration back when it did not.
        if (Schema::hasColumn('overtime_requests', 'ticket_number')) {
            return;
        }

        Schema::table('overtime_requests', function (Blueprint $table) {
            $table->string('ticket_number', 100)->nullable()->after('classification');
        });
    }

    public function down(): void
    {
        Schema::table('overtime_requests', function (Blueprint $table) {
            $table->dropColumn('ticket_number');
        });
    }
};
