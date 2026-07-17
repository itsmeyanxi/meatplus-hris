<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Models\TimeLogRequest;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\Attendance\Services\TimeLogRequestImportService;
use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use App\Http\Resources\Attendance\TimeLogRequestResource;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Admin-uploaded time logs that wait for approval. Uploading needs
 * attendance.manage; reviewing/approving needs attendance.approve.any. Approval
 * writes real punches into time_logs and recomputes that day's DTR.
 */
class TimeLogRequestController extends Controller
{
    private const TZ = 'Asia/Manila';

    /** Upload a day-level sheet -> pending rows. */
    public function import(Request $request, TimeLogRequestImportService $service): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('attendance.manage'), 403);

        $request->validate(['file' => ['required', 'file', 'max:5120']]);

        $file = $request->file('file');
        $head = @file_get_contents($file->getRealPath(), false, null, 0, 8) ?: '';
        $format = str_starts_with($head, "PK\x03\x04") ? 'xlsx'
            : (str_starts_with($head, "\xD0\xCF\x11\xE0") ? null : 'csv');
        if ($format === null) {
            return response()->json(['message' => 'Unsupported file. Upload a .csv or .xlsx.'], 422);
        }

        $result = $service->import($file->getRealPath(), $format, (int) $user->active_company_id, $user->id);

        return response()->json($result);
    }

    /** List time-log requests (default: pending) for review. */
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();
        abort_unless($user->can('attendance.approve.any') || $user->can('attendance.manage'), 403);

        $q = TimeLogRequest::query()
            ->with(['employee:id,employee_no,first_name,last_name,middle_name,suffix', 'uploader:id,name'])
            ->where('status', $request->query('status', 'pending'))
            ->orderBy('batch_id')
            ->orderBy('work_date');

        if ($batch = $request->query('batch_id')) {
            $q->where('batch_id', $batch);
        }

        return TimeLogRequestResource::collection($q->limit(1000)->get());
    }

    public function approve(Request $request, TimeLogRequest $timeLogRequest): JsonResponse
    {
        abort_unless($request->user()->can('attendance.approve.any'), 403);

        if ($timeLogRequest->status !== 'pending') {
            return response()->json(['message' => 'This request has already been decided.'], 422);
        }

        $this->applyApproval($timeLogRequest, $request->user()->id);

        return response()->json(['message' => 'Approved.', 'data' => new TimeLogRequestResource($timeLogRequest->fresh('employee'))]);
    }

    public function reject(Request $request, TimeLogRequest $timeLogRequest): JsonResponse
    {
        abort_unless($request->user()->can('attendance.approve.any'), 403);

        if ($timeLogRequest->status !== 'pending') {
            return response()->json(['message' => 'This request has already been decided.'], 422);
        }

        $timeLogRequest->update([
            'status' => 'rejected',
            'decided_by' => $request->user()->id,
            'decided_at' => now(),
            'decision_remarks' => $request->input('decision_remarks'),
        ]);

        return response()->json(['message' => 'Rejected.']);
    }

    /** Approve every pending row in a batch in one action. */
    public function approveBatch(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('attendance.approve.any'), 403);
        $batch = $request->validate(['batch_id' => ['required', 'uuid']])['batch_id'];

        $pending = TimeLogRequest::query()->where('batch_id', $batch)->where('status', 'pending')->get();
        foreach ($pending as $req) {
            $this->applyApproval($req, $request->user()->id);
        }

        return response()->json(['message' => "Approved {$pending->count()} row(s).", 'approved' => $pending->count()]);
    }

    /** Write the punches for a pending row into time_logs and recompute its DTR. */
    private function applyApproval(TimeLogRequest $req, int $deciderId): void
    {
        DB::transaction(function () use ($req, $deciderId) {
            $date = $req->work_date->toDateString();

            $make = function (?string $time, string $direction) use ($req, $date) {
                if (! $time) {
                    return;
                }
                TimeLog::create([
                    'company_id' => $req->company_id,
                    'employee_id' => $req->employee_id,
                    'logged_at' => CarbonImmutable::parse("{$date} {$time}", self::TZ),
                    'direction' => $direction,
                    'source' => 'manual',
                    'device_id' => 'UPLOAD',
                    'source_event_id' => (string) Str::uuid(),
                    'metadata' => ['time_log_request_id' => $req->id, 'batch_id' => $req->batch_id],
                ]);
            };
            $make($req->time_in, 'in');
            $make($req->time_out, 'out');

            $req->update(['status' => 'approved', 'decided_by' => $deciderId, 'decided_at' => now()]);

            // Recompute just that employee's day so the punch flows into DTR now.
            $employee = Employee::withoutGlobalScopes()->find($req->employee_id);
            if ($employee) {
                $day = CarbonImmutable::parse($date);
                app(DtrComputer::class)->computeForEmployee($employee, $day, $day);
            }
        });
    }

    /** Download a CSV template (day-level: Employee ID | Date | Time In | Time Out). */
    public function template(Request $request): StreamedResponse
    {
        abort_unless($request->user()->can('attendance.manage'), 403);

        $headers = ['Employee ID', 'Date', 'Time In', 'Time Out'];
        $example = ['2160073', '2026-07-14', '08:01', '17:05'];

        return response()->streamDownload(function () use ($headers, $example) {
            $out = fopen('php://output', 'w');
            fputcsv($out, $headers);
            fputcsv($out, $example);
            fclose($out);
        }, 'time_log_upload_template.csv', ['Content-Type' => 'text/csv']);
    }
}
