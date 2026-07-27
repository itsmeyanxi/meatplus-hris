<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Recurring loan/amortization deductions and one-off payslip adjustments — the
 * two things a real payroll run needs beyond salary + attendance. Loans carry a
 * running balance that PayrollComputer amortizes each cutoff and post() draws
 * down; adjustments are one-off earnings or deductions scoped to a single run.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_loans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('type', 40);              // sss_salary, pagibig_mpl, company, cash_advance, other...
            $table->string('reference_no', 60)->nullable();
            $table->decimal('principal', 12, 2)->default(0);
            $table->decimal('amortization', 12, 2)->default(0);      // deducted per cutoff
            $table->decimal('outstanding_balance', 12, 2)->default(0);
            $table->date('start_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->string('notes', 255)->nullable();
            $table->timestamps();
            $table->index(['company_id', 'employee_id', 'is_active']);
        });

        Schema::create('payslip_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payroll_run_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('label', 120);
            $table->enum('kind', ['earning', 'deduction']);
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('notes', 255)->nullable();
            $table->timestamps();
            $table->index(['company_id', 'payroll_run_id', 'employee_id']);
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('other_earnings', 12, 2)->default(0)->after('rest_day_pay');
            $table->decimal('loans_deduction', 12, 2)->default(0)->after('tardiness_deduction');
            $table->decimal('other_deductions', 12, 2)->default(0)->after('loans_deduction');
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn(['other_earnings', 'loans_deduction', 'other_deductions']);
        });
        Schema::dropIfExists('payslip_adjustments');
        Schema::dropIfExists('employee_loans');
    }
};
