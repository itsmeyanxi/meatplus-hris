<?php

namespace App\Http\Controllers\Api\V1\Agencies;

use App\Domain\Attendance\Models\TimeLog;
use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\Position;
use App\Domain\Identity\Models\Branch;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The Agency module — agency branches (is_agency) for the active company, with a
 * live attendance slant since agency workers' time in/out is what matters most.
 */
class AgencyController extends Controller
{
    private function tz(): string
    {
        return config('app.timezone', 'Asia/Manila');
    }

    /** The branch flag this module lists. Overridden by CrewController. */
    protected function branchFlag(): string
    {
        return 'is_agency';
    }

    /** Whether to show ALL branches when the company has none of this flag. */
    protected function fallbackToAllBranches(): bool
    {
        return true;
    }

    /** GET /api/v1/agencies — one row per agency with headcount + today's attendance. */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('employee.view'), 403);
        $companyId = $user->active_company_id;
        abort_unless($companyId, 400, 'Switch to a company first.');

        $base = fn () => Branch::query()
            ->where('company_id', $companyId)->where('is_active', true)
            ->withCount(['employees as headcount' => fn ($q) => $q->where('is_active', true)])
            ->orderBy('name');

        // Agencies when the company tags any (e.g. PASEI); otherwise fall back to
        // all branches so the page still works for ordinary branch-based companies.
        $branches = $base()->where($this->branchFlag(), true)->get(['id', 'code', 'name']);
        if ($branches->isEmpty() && $this->fallbackToAllBranches()) {
            $branches = $base()->get(['id', 'code', 'name']);
        }

        $today = Carbon::now($this->tz())->toDateString();
        $present = DB::table('time_logs as t')->join('employees as e', 't.employee_id', '=', 'e.id')
            ->where('e.company_id', $companyId)
            ->whereIn('e.branch_id', $branches->pluck('id'))
            ->whereDate('t.logged_at', $today)
            ->select('e.branch_id', DB::raw('count(distinct e.id) c'))
            ->groupBy('e.branch_id')->pluck('c', 'e.branch_id');

        return response()->json([
            'date' => $today,
            'data' => $branches->map(fn ($b) => [
                'id' => $b->id,
                'code' => $b->code,
                'name' => $b->name,
                'headcount' => (int) $b->headcount,
                'present_today' => (int) ($present[$b->id] ?? 0),
            ])->values(),
        ]);
    }

    /**
     * POST /api/v1/agencies/{branch}/employees — manually add ONE worker to an
     * agency. Minimal fields (agency workers rarely have full HR profiles); the
     * branch is fixed to this agency and biometric defaults to the employee no.
     */
    public function storeEmployee(Request $request, int $branch): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('employee.create'), 403);

        $b = Branch::query()->find($branch);
        abort_unless($b && (int) $b->company_id === (int) $user->active_company_id, 404, 'Agency not found.');

        $data = $request->validate([
            'employee_no' => ['required', 'string', 'max:30', Rule::unique('employees', 'employee_no')->where('company_id', $b->company_id)],
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'biometric_user_id' => ['nullable', 'string', 'max:50'],
            'position' => ['nullable', 'string', 'max:150'],
            'date_hired' => ['nullable', 'date'],
        ]);

        $positionId = null;
        if (! empty($data['position'])) {
            $positionId = Position::query()->where('company_id', $b->company_id)
                ->whereRaw('LOWER(title) = ?', [strtolower($data['position'])])->value('id')
                ?? Position::create(['company_id' => $b->company_id, 'title' => $data['position'], 'is_active' => true])->id;
        }

        $employee = Employee::create([
            'company_id' => $b->company_id,
            'branch_id' => $b->id,
            'employee_no' => $data['employee_no'],
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'middle_name' => $data['middle_name'] ?? null,
            'biometric_user_id' => $data['biometric_user_id'] ?: $data['employee_no'],
            'position_id' => $positionId,
            'date_hired' => $data['date_hired'] ?? null,
            'is_active' => true,
        ]);

        return response()->json(['id' => $employee->id, 'message' => "{$employee->first_name} {$employee->last_name} added to {$b->name}."], 201);
    }

    /** GET /api/v1/agencies/{branch}/today — per-employee time in/out board for today. */
    public function today(Request $request, int $branch): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('employee.view'), 403);

        $b = Branch::query()->find($branch);
        abort_unless($b && (int) $b->company_id === (int) $user->active_company_id, 404, 'Agency not found.');

        $employees = Employee::query()
            ->where('company_id', $b->company_id)->where('branch_id', $b->id)->where('is_active', true)
            ->orderBy('last_name')->orderBy('first_name')
            ->get(['id', 'employee_no', 'first_name', 'last_name', 'biometric_user_id']);

        $today = Carbon::now($this->tz())->toDateString();
        $logs = TimeLog::query()
            ->whereIn('employee_id', $employees->pluck('id'))
            ->whereDate('logged_at', $today)
            ->orderBy('logged_at')
            ->get(['employee_id', 'logged_at']);

        $byEmp = [];
        foreach ($logs as $l) {
            $t = Carbon::parse($l->logged_at)->setTimezone($this->tz());
            $e = &$byEmp[$l->employee_id];
            $e['in'] = $e['in'] ?? $t;
            $e['out'] = $t;
            $e['n'] = ($e['n'] ?? 0) + 1;
            unset($e);
        }

        $rows = $employees->map(function ($e) use ($byEmp) {
            $rec = $byEmp[$e->id] ?? null;
            $in = $rec['in'] ?? null;
            // A time-out only counts when it's a real gap after the time-in (30 min+).
            // Two taps a few minutes apart are a double-tap at arrival, not a clock-out.
            $out = ($rec && ($rec['n'] ?? 0) > 1 && $in && $rec['out']->diffInMinutes($in) >= 30)
                ? $rec['out'] : null;
            $status = $in ? ($out ? 'complete' : 'no_out') : 'no_punch';

            return [
                'id' => $e->id,
                'employee_no' => $e->employee_no,
                'name' => Employee::formatName($e->first_name, $e->last_name),
                'biometric_id' => $e->biometric_user_id,
                'time_in' => $in?->format('h:i A'),
                'time_out' => $out?->format('h:i A'),
                'punches' => $rec['n'] ?? 0,
                'status' => $status,
            ];
        });

        return response()->json([
            'date' => $today,
            'agency' => ['id' => $b->id, 'name' => $b->name, 'code' => $b->code],
            'summary' => [
                'headcount' => $employees->count(),
                'present' => $rows->where('status', '!=', 'no_punch')->count(),
                'complete' => $rows->where('status', 'complete')->count(),
                'no_out' => $rows->where('status', 'no_out')->count(),
                'no_punch' => $rows->where('status', 'no_punch')->count(),
            ],
            'employees' => $rows->values(),
        ]);
    }
}
