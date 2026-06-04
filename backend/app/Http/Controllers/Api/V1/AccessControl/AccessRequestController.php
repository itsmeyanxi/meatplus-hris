<?php

namespace App\Http\Controllers\Api\V1\AccessControl;

use App\Domain\AccessControl\Models\AccessRequest;
use App\Http\Controllers\Controller;
use App\Http\Requests\AccessControl\StoreAccessRequestRequest;
use App\Http\Resources\AccessControl\AccessRequestResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AccessRequestController extends Controller
{
    /** Approval chain order. */
    private const STAGES = ['supervisor', 'hr', 'it'];

    /** Which permission gates each stage's decision. */
    private const STAGE_PERMISSION = [
        'supervisor' => 'access_request.approve.supervisor',
        'hr' => 'access_request.approve.hr',
        'it' => 'access_request.approve.it',
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('access_request.view'), 403);

        $q = AccessRequest::query()
            ->with('requester:id,name,email')
            ->latest('id');

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($stage = $request->query('stage')) {
            $q->where('current_stage', $stage)->where('status', 'pending');
        }

        return AccessRequestResource::collection($q->limit(500)->get());
    }

    public function stats(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('access_request.view'), 403);

        $byStatus = AccessRequest::query()
            ->selectRaw('status, COUNT(*) as c')
            ->groupBy('status')
            ->pluck('c', 'status');

        $byStage = AccessRequest::query()
            ->where('status', 'pending')
            ->selectRaw('current_stage, COUNT(*) as c')
            ->groupBy('current_stage')
            ->pluck('c', 'current_stage');

        return response()->json([
            'totals' => [
                'total' => (int) $byStatus->sum(),
                'pending' => (int) ($byStatus['pending'] ?? 0),
                'approved' => (int) ($byStatus['approved'] ?? 0),
                'disapproved' => (int) ($byStatus['rejected'] ?? 0),
            ],
            'queues' => [
                'supervisor' => (int) ($byStage['supervisor'] ?? 0),
                'hr' => (int) ($byStage['hr'] ?? 0),
                'it' => (int) ($byStage['it'] ?? 0),
            ],
        ]);
    }

    public function store(StoreAccessRequestRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = $request->user();

        $accessRequest = DB::transaction(function () use ($data, $user) {
            $accessRequest = AccessRequest::create([
                'requested_by_user_id' => $user->id,
                'request_type' => $data['request_type'],
                'effective_date' => $data['effective_date'],
                'ticket_number' => $data['ticket_number'] ?? null,
                'employee_name' => $data['employee_name'],
                'employee_id_number' => $data['employee_id_number'],
                'position' => $data['position'],
                'department' => $data['department'],
                'employment_status' => $data['employment_status'],
                'immediate_supervisor' => $data['immediate_supervisor'],
                'company_email' => $data['company_email'],
                'contact_number' => $data['contact_number'],
                'justification' => $data['justification'],
                'status' => 'pending',
                'current_stage' => 'supervisor',
                'submitted_at' => now(),
            ]);

            foreach (($data['modules'] ?? []) as $module => $levels) {
                if (empty($levels)) {
                    continue;
                }
                $accessRequest->modules()->create([
                    'module' => $module,
                    'view' => in_array('view', $levels, true),
                    'user' => in_array('user', $levels, true),
                    'approver' => in_array('approver', $levels, true),
                    'admin' => in_array('admin', $levels, true),
                ]);
            }

            foreach (self::STAGES as $i => $stage) {
                $accessRequest->approvals()->create([
                    'stage' => $stage,
                    'sequence' => $i + 1,
                    'status' => 'pending',
                ]);
            }

            return $accessRequest;
        });

        $accessRequest->load(['requester:id,name,email', 'modules', 'approvals']);

        return (new AccessRequestResource($accessRequest))->response()->setStatusCode(201);
    }

    public function show(Request $request, AccessRequest $accessRequest): AccessRequestResource
    {
        abort_unless($request->user()->can('access_request.view'), 403);

        return new AccessRequestResource(
            $accessRequest->load(['requester:id,name,email', 'modules', 'approvals.decider:id,name']),
        );
    }

    public function approve(Request $request, AccessRequest $accessRequest): AccessRequestResource
    {
        return $this->decide($request, $accessRequest, 'approved');
    }

    public function reject(Request $request, AccessRequest $accessRequest): AccessRequestResource
    {
        return $this->decide($request, $accessRequest, 'rejected');
    }

    private function decide(Request $request, AccessRequest $accessRequest, string $decision): AccessRequestResource
    {
        $validated = $request->validate([
            'remarks' => ['nullable', 'string', 'max:1000'],
        ]);

        if ($accessRequest->status !== 'pending') {
            throw ValidationException::withMessages([
                'status' => "This request is already {$accessRequest->status}.",
            ]);
        }

        $stage = $accessRequest->current_stage;
        $permission = self::STAGE_PERMISSION[$stage] ?? null;
        abort_unless($permission && $request->user()->can($permission), 403, "You cannot act on the {$stage} stage.");

        DB::transaction(function () use ($request, $accessRequest, $decision, $stage, $validated) {
            $accessRequest->approvals()
                ->where('stage', $stage)
                ->update([
                    'status' => $decision,
                    'decided_by_user_id' => $request->user()->id,
                    'decided_at' => now(),
                    'remarks' => $validated['remarks'] ?? null,
                ]);

            if ($decision === 'rejected') {
                $accessRequest->update(['status' => 'rejected']);

                return;
            }

            // Approved this stage — advance to the next, or complete.
            $idx = array_search($stage, self::STAGES, true);
            $next = self::STAGES[$idx + 1] ?? null;

            $accessRequest->update(
                $next === null
                    ? ['status' => 'approved', 'current_stage' => 'done']
                    : ['current_stage' => $next],
            );
        });

        return new AccessRequestResource(
            $accessRequest->fresh()->load(['requester:id,name,email', 'modules', 'approvals.decider:id,name']),
        );
    }
}
