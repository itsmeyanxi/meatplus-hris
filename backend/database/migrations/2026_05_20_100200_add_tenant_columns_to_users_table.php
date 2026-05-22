<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('active_company_id')->nullable()->after('password')
                ->constrained('companies')->nullOnDelete();
            $table->boolean('is_active')->default(true)->after('active_company_id');
            $table->timestamp('last_login_at')->nullable()->after('is_active');
            $table->text('two_factor_secret')->nullable()->after('last_login_at');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['active_company_id']);
            $table->dropColumn([
                'active_company_id',
                'is_active',
                'last_login_at',
                'two_factor_secret',
                'two_factor_recovery_codes',
                'deleted_at',
            ]);
        });
    }
};
