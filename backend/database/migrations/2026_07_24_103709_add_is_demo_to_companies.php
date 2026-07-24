<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Marks sandbox companies. Admin roles are company-wide, so every it_admin and
 * hr_admin was auto-attached to EVERY active company — which swept the DEMO
 * sandbox into real admins' company switchers and left them landing in it.
 * Flagging demo companies lets that auto-attach skip them; demo accounts are
 * attached explicitly by the seeder, so they are unaffected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->boolean('is_demo')->default(false)->after('is_active');
        });

        DB::table('companies')->where('code', 'DEMO')->update(['is_demo' => true]);
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn('is_demo');
        });
    }
};
