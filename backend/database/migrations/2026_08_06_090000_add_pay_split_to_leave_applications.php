<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Store the paid vs unpaid day split on a leave application (mirrors a Sprout
 * LeaveReport's WithPayNoOfdays / WoutPayNoOfDays), so the leave report can show
 * it and only the paid portion draws down leave credits.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_applications', function (Blueprint $table) {
            $table->decimal('with_pay_days', 5, 2)->nullable()->after('days_count');
            $table->decimal('without_pay_days', 5, 2)->nullable()->after('with_pay_days');
        });
    }

    public function down(): void
    {
        Schema::table('leave_applications', function (Blueprint $table) {
            $table->dropColumn(['with_pay_days', 'without_pay_days']);
        });
    }
};
