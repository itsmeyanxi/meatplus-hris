<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Cross-company overview for super-admins (admin / it_admin). Aggregates every
 * active company at once — headcount, accounts, attendance, pending approvals,
 * latest payroll, and data gaps — plus a system-health snapshot. Bypasses the
 * per-company scope on purpose (it's the whole point of the admin view).
 */
class OverviewController extends Controller
{
    /** Pending attendance-request tables that need approval. */
    private const REQUEST_TABLES = [
        'overtime_requests', 'undertime_requests', 'official_business_requests',
        'certificate_of_attendance_requests', 'attendance_corrections',
    ];

    public function __invoke(Request $request): JsonResponse
    {
        abort_unless($this->isSuperAdmin($request->user()->id), 403, 'Admin view is for super-admins only.');

        $companies = DB::table('companies')->where('is_active', true)->orderBy('id')->get(['id', 'code', 'legal_name', 'is_demo']);

        $items = [];
        foreach ($companies as $c) {
            $empIds = DB::table('employees')->where('company_id', $c->id)->where('is_active', true)->whereNull('deleted_at')->pluck('id');
            $n = $empIds->count();

            // Accounts: employees in this company that have a login.
            $withLogin = DB::table('employees')->where('company_id', $c->id)->where('is_active', true)->whereNull('deleted_at')->whereNotNull('user_id')->count();

            // Attendance today.
            $today = now()->toDateString();
            $punchesToday = DB::table('time_logs')->where('company_id', $c->id)->whereDate('logged_at', $today)->count();
            $presentToday = DB::table('daily_time_records')->where('company_id', $c->id)->whereDate('work_date', $today)->whereNotNull('actual_in')->count();

            // Pending approvals (leave + attendance requests) for this company's employees.
            $pending = DB::table('leave_applications')->whereIn('employee_id', $empIds)->where('status', 'pending')->count();
            foreach (self::REQUEST_TABLES as $t) {
                $pending += DB::table($t)->whereIn('employee_id', $empIds)->where('status', 'pending')->count();
            }

            // Latest payroll run.
            $run = DB::table('payroll_runs')->where('company_id', $c->id)->orderByDesc('period_end')->first(['name', 'status', 'period_start', 'period_end']);

            // Data gaps.
            $hasSal = DB::table('employee_compensations')->whereIn('employee_id', $empIds)->where('is_active', true)->where(fn ($q) => $q->where('basic_monthly', '>', 0)->orWhere('daily_rate', '>', 0)->orWhere('hourly_rate', '>', 0))->distinct('employee_id')->count('employee_id');
            $hasBank = DB::table('employee_bank_accounts')->whereIn('employee_id', $empIds)->distinct('employee_id')->count('employee_id');
            $hasGov = DB::table('employee_government_ids')->whereIn('employee_id', $empIds)->distinct('employee_id')->count('employee_id');
            $hasSched = DB::table('employee_schedules')->whereIn('employee_id', $empIds)->distinct('employee_id')->count('employee_id');
            $hasPos = DB::table('employees')->where('company_id', $c->id)->where('is_active', true)->whereNull('deleted_at')->whereNotNull('position_id')->count();

            $items[] = [
                'id' => $c->id,
                'code' => $c->code,
                'name' => $c->legal_name,
                'is_demo' => (bool) $c->is_demo,
                'employees' => $n,
                'with_login' => $withLogin,
                'punches_today' => $punchesToday,
                'present_today' => $presentToday,
                'pending_approvals' => $pending,
                'latest_run' => $run ? ['name' => $run->name, 'status' => $run->status, 'period' => $run->period_start.' → '.$run->period_end] : null,
                'gaps' => [
                    'no_salary' => max(0, $n - $hasSal),
                    'no_bank' => max(0, $n - $hasBank),
                    'no_gov' => max(0, $n - $hasGov),
                    'no_position' => max(0, $n - $hasPos),
                    'no_schedule' => max(0, $n - $hasSched),
                ],
            ];
        }

        // Recent payroll runs across all companies.
        $recentRuns = DB::table('payroll_runs as r')
            ->leftJoin('companies as c', 'c.id', 'r.company_id')
            ->leftJoin('payslips as p', 'p.payroll_run_id', 'r.id')
            ->orderByDesc('r.period_end')->groupBy('r.id', 'c.code', 'r.name', 'r.status', 'r.period_start', 'r.period_end')
            ->limit(12)
            ->get([
                'r.id', 'c.code as company', 'r.name', 'r.status', 'r.period_start', 'r.period_end',
                DB::raw('count(p.id) as payslips'), DB::raw('coalesce(sum(p.gross_pay),0) as gross'), DB::raw('coalesce(sum(p.net_pay),0) as net'),
            ])
            ->map(fn ($r) => [
                'id' => $r->id, 'company' => $r->company, 'name' => $r->name, 'status' => $r->status,
                'period' => $r->period_start.' → '.$r->period_end,
                'payslips' => (int) $r->payslips, 'gross' => (float) $r->gross, 'net' => (float) $r->net,
            ]);

        return response()->json([
            'generated_at' => now()->toIso8601String(),
            'totals' => [
                'companies' => count($items),
                'employees' => array_sum(array_column($items, 'employees')),
                'with_login' => array_sum(array_column($items, 'with_login')),
                'pending_approvals' => array_sum(array_column($items, 'pending_approvals')),
            ],
            'companies' => $items,
            'recent_runs' => $recentRuns,
            'system' => [
                'latest_punch' => DB::table('time_logs')->max('logged_at'),
                'punches_24h' => DB::table('time_logs')->where('logged_at', '>=', now()->subDay())->count(),
                'mail_pending' => DB::table('jobs')->count(),
                'mail_failed' => DB::table('failed_jobs')->count(),
                'logins_24h' => DB::table('users')->where('last_login_at', '>=', now()->subDay())->count(),
                'active_users' => DB::table('users')->where('is_active', true)->count(),
                'server_time' => now()->toDateTimeString(),
            ],
        ]);
    }

    /** True if the user holds the admin or it_admin role in any team. */
    private function isSuperAdmin(int $userId): bool
    {
        return DB::table('model_has_roles as mr')
            ->join('roles as r', 'r.id', 'mr.role_id')
            ->where('mr.model_id', $userId)
            ->where('mr.model_type', 'App\\Models\\User')
            ->whereIn('r.name', ['admin', 'it_admin'])
            ->exists();
    }
}
