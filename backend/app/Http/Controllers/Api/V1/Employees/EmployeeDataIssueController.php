<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\EmployeeDataIssue;
use App\Domain\HRIS\Services\EmployeeDataIssueDetector;
use App\Http\Controllers\Controller;
use App\Http\Resources\Employees\EmployeeDataIssueResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * HR review + resolution of detected employee-data problems
 * (see {@see EmployeeDataIssueDetector}). Listing is scoped to the active company
 * like the rest of the employee module; fixing needs employee.update.
 */
class EmployeeDataIssueController extends Controller
{
    private const RELATION = 'employee:id,first_name,last_name,employee_no,company_id';

    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        $companyId = $request->query('company_id') ?: $request->user()->active_company_id;

        $query = EmployeeDataIssue::with(self::RELATION)
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->when(! $request->boolean('include_ignored'), fn ($q) => $q->where('ignored', false))
            ->when(! $request->boolean('include_resolved'), fn ($q) => $q->whereNull('resolved_at'))
            ->orderByRaw("case severity when 'high' then 0 when 'medium' then 1 else 2 end")
            ->orderBy('category');

        return EmployeeDataIssueResource::collection($query->get());
    }

    /** Re-run detection now ("Check now"). */
    public function rescan(Request $request, EmployeeDataIssueDetector $detector): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        return response()->json($detector->syncAndNotify());
    }

    /** Dismiss an intentional gap so it stops being flagged/re-notified. */
    public function ignore(Request $request, EmployeeDataIssue $employeeDataIssue): EmployeeDataIssueResource
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $employeeDataIssue->forceFill(['ignored' => true, 'resolved_at' => now()])->save();

        return new EmployeeDataIssueResource($employeeDataIssue->load(self::RELATION));
    }
}
