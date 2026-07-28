<?php

namespace App\Http\Controllers\Api\V1\Me;

use App\Domain\Attendance\Models\AttendanceCorrection;
use App\Domain\Attendance\Models\CertificateOfAttendanceRequest;
use App\Domain\Attendance\Models\OfficialBusinessRequest;
use App\Domain\Attendance\Models\OvertimeRequest;
use App\Domain\Attendance\Models\ScheduleAdjustmentRequest;
use App\Domain\Attendance\Models\UndertimeRequest;
use App\Domain\HRIS\Models\Employee;
use App\Domain\Leave\Models\LeaveApplication;
use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Approval Center — every pending request the signed-in user can act on, across
 * leave and the five attendance request types, in one list.
 *
 * Scope mirrors each type's approve rules: a global approver
 * (leave.approve.any / attendance.approve.any|manage) sees everything in their
 * active company; a manager / department head sees requests from their team.
 * Team requests are resolved WITHOUT the company scope, so a cross-company
 * manager (e.g. the IT head) still sees a report's request filed in another
 * company. Users never see their own requests here (can't approve yourself).
 */
class ApprovalCenterController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $me = Employee::withoutGlobalScopes()->where('user_id', $user->id)->first(['id']);

        // Employees this user manages (direct reports + departments they head) — cross-company.
        $teamIds = [];
        if ($me) {
            $teamIds = Employee::withoutGlobalScopes()
                ->where(function ($q) use ($me) {
                    $q->where('manager_employee_id', $me->id)
                        ->orWhereHas('department', fn ($d) => $d->where('head_employee_id', $me->id));
                })
                ->pluck('id')->all();
        }

        $globalLeave = $user->can('leave.approve.any');
        $globalAttendance = $user->can('attendance.approve.any') || $user->can('attendance.manage');
        $myEmpId = $me?->id;

        $types = [
            ['key' => 'leave', 'label' => 'Leave', 'model' => LeaveApplication::class, 'global' => $globalLeave, 'date' => 'date_from', 'url' => '/leaves', 'summary' => fn ($r) => $this->leaveSummary($r)],
            ['key' => 'overtime', 'label' => 'Overtime', 'model' => OvertimeRequest::class, 'global' => $globalAttendance, 'date' => 'date', 'url' => '/attendance/requests/overtime', 'summary' => fn ($r) => $r->requested_hours ? "{$r->requested_hours} hr(s)" : 'Overtime'],
            ['key' => 'official_business', 'label' => 'Official Business', 'model' => OfficialBusinessRequest::class, 'global' => $globalAttendance, 'date' => 'date', 'url' => '/attendance/requests/official-business', 'summary' => fn ($r) => $r->location ?? $r->purpose ?? 'Official business'],
            ['key' => 'undertime', 'label' => 'Undertime', 'model' => UndertimeRequest::class, 'global' => $globalAttendance, 'date' => 'date', 'url' => '/attendance/requests/undertime', 'summary' => fn ($r) => $r->reason ?? 'Undertime'],
            ['key' => 'coa', 'label' => 'Certificate of Attendance', 'model' => CertificateOfAttendanceRequest::class, 'global' => $globalAttendance, 'date' => 'work_date', 'url' => '/attendance/requests/certificate-of-attendance', 'summary' => fn ($r) => $r->reason ?? 'Certificate of attendance'],
            ['key' => 'correction', 'label' => 'Attendance Correction', 'model' => AttendanceCorrection::class, 'global' => $globalAttendance, 'date' => 'work_date', 'url' => '/attendance/requests/corrections', 'summary' => fn ($r) => $r->reason ?? 'Correction'],
            ['key' => 'schedule_adjustment', 'label' => 'Schedule Adjustment', 'model' => ScheduleAdjustmentRequest::class, 'global' => $globalAttendance, 'date' => 'from_date', 'url' => '/schedule-adjustments', 'list_only' => true, 'summary' => fn ($r) => ($r->shift_start && $r->shift_end) ? "{$r->shift_start}–{$r->shift_end}" : ($r->reason ?? 'Schedule adjustment')],
        ];

        $items = collect();
        $counts = [];

        foreach ($types as $t) {
            $rows = $this->pendingFor($t['model'], $t['global'], $teamIds, $myEmpId);
            $counts[$t['key']] = $rows->count();

            foreach ($rows as $r) {
                $emp = $r->employee;
                $items->push([
                    'type' => $t['key'],
                    'type_label' => $t['label'],
                    'id' => $r->id,
                    'employee_name' => $emp ? trim(($emp->first_name ?? '').' '.($emp->last_name ?? '')) : "#{$r->employee_id}",
                    'employee_no' => $emp?->employee_no,
                    'company' => $emp?->company?->code ?? $emp?->company?->trade_name,
                    'date' => optional($r->{$t['date']})->format('Y-m-d') ?? (string) $r->{$t['date']},
                    'summary' => ($t['summary'])($r),
                    'url' => ($t['list_only'] ?? false) ? $t['url'] : "{$t['url']}/{$r->id}",
                    'filed_at' => $r->created_at,
                ]);
            }
        }

        $sorted = $items->sortByDesc('filed_at')->values();

        // Whether this user is an approver at all (so the UI can show the panel
        // with an empty state rather than hiding it when nothing is pending).
        $isApprover = $globalLeave || $globalAttendance
            || $user->can('leave.approve.self_dept')
            || $user->can('attendance.approve.self_dept')
            || ! empty($teamIds);

        return response()->json([
            'is_approver' => $isApprover,
            'total' => $sorted->count(),
            'counts' => $counts,
            'items' => $sorted,
        ]);
    }

    /**
     * Pending rows of one request type the user may approve: active-company rows
     * (when a global approver) unioned with their cross-company team's rows.
     *
     * @param  class-string<Model>  $model
     * @param  array<int,int>  $teamIds
     */
    private function pendingFor(string $model, bool $global, array $teamIds, ?int $myEmpId)
    {
        $rows = collect();

        // Active-company scope (respects CompanyScope) for global approvers.
        if ($global) {
            $rows = $model::query()
                ->where('status', 'pending')
                ->with(['employee' => fn ($q) => $q->withoutGlobalScopes()
                    ->select('id', 'employee_no', 'first_name', 'last_name', 'company_id')
                    ->with('company:id,code,trade_name')])
                ->latest()->limit(200)->get();
        }

        // Team rows, cross-company (ignores CompanyScope).
        if (! empty($teamIds)) {
            $team = $model::withoutGlobalScopes()
                ->where('status', 'pending')
                ->whereIn('employee_id', $teamIds)
                ->with(['employee' => fn ($q) => $q->withoutGlobalScopes()
                    ->select('id', 'employee_no', 'first_name', 'last_name', 'company_id')
                    ->with('company:id,code,trade_name')])
                ->latest()->limit(200)->get();
            $rows = $rows->concat($team);
        }

        return $rows->unique('id')
            ->when($myEmpId, fn ($c) => $c->reject(fn ($r) => $r->employee_id === $myEmpId))
            ->values();
    }

    private function leaveSummary(LeaveApplication $r): string
    {
        $type = $r->leaveType?->name ?? 'Leave';
        if ($r->date_from && $r->date_to && $r->date_from != $r->date_to) {
            return "{$type} · to ".\Illuminate\Support\Carbon::parse($r->date_to)->format('Y-m-d');
        }

        return $type;
    }
}
