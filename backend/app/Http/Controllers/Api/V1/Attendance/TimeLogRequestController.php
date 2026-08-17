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
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

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

            $make = function (?string $time, string $direction, ?CarbonImmutable $after = null) use ($req, $date) {
                if (! $time) {
                    return null;
                }

                $at = CarbonImmutable::parse("{$date} {$time}", self::TZ);

                // Overnight shift: the template (and its own guide) puts BOTH times on
                // the shift's START date — "In 20:00, Out 05:00". Stored literally, the
                // 05:00 out landed 15 hours BEFORE the in, so the DTR read 05:00 as the
                // arrival and 20:00 as the departure and credited 14 hours instead of 9.
                // An out that is not after the in belongs to the next calendar day.
                if ($after && $at->lessThanOrEqualTo($after)) {
                    $at = $at->addDay();
                }

                TimeLog::create([
                    'company_id' => $req->company_id,
                    'employee_id' => $req->employee_id,
                    'logged_at' => $at,
                    'direction' => $direction,
                    'source' => 'manual',
                    'device_id' => 'UPLOAD',
                    'source_event_id' => (string) Str::uuid(),
                    'metadata' => ['time_log_request_id' => $req->id, 'batch_id' => $req->batch_id],
                ]);

                return $at;
            };
            $in = $make($req->time_in, 'in');
            $make($req->time_out, 'out', $in);

            $req->update(['status' => 'approved', 'decided_by' => $deciderId, 'decided_at' => now()]);

            // Recompute so the punches flow into the DTR now. Widened by a day each
            // side because an overnight shift's out-punch lands on the NEXT date (see
            // $make above) and the shift may have started the previous evening.
            $employee = Employee::withoutGlobalScopes()->find($req->employee_id);
            if ($employee) {
                $day = CarbonImmutable::parse($date);
                app(DtrComputer::class)->computeForEmployee($employee, $day->subDay(), $day->addDay());
            }
        });
    }

    /**
     * Download a ready-to-fill Excel template for uploading attendance:
     * a "How to fill" guide sheet plus a "Time Logs" sheet (day-level:
     * Employee ID | Date | Time In | Time Out). Uploaded rows become PENDING
     * time-log requests for review, not final attendance.
     */
    public function template(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('attendance.manage'), 403);

        $headers = ['Employee ID', 'Date', 'Time In', 'Time Out'];
        // One row per employee per day. Time In/Out are 24-hour HH:MM.
        $examples = [
            ['2160073', '2026-07-14', '08:01', '17:05'],
            ['2160073', '2026-07-15', '07:58', '17:02'],
            ['5', '2026-07-14', '08:00', '17:00'],
            ['6', '2026-07-14', '13:00', '22:00'],   // afternoon/night shift
            ['9', '2026-07-14', '08:03', ''],         // only timed in (no out captured)
        ];

        $guide = [
            ['ALL COMPANY HRIS — Attendance (Time In / Time Out) Upload Template'],
            [''],
            ['HOW TO USE'],
            ['1. Fill in the "Time Logs" tab (second tab below). ONE ROW PER EMPLOYEE, PER DAY.'],
            ['2. In the app go to Attendance > Time Logs (or Timekeeping) > Upload, pick the company, and upload this file.'],
            ['3. Uploaded rows are created as PENDING requests for review — they are NOT final attendance until approved.'],
            ['4. You may upload .xlsx or .csv. Column order does not matter — only the header names do.'],
            [''],
            ['COLUMNS'],
            ['   • Employee ID  — REQUIRED. The worker\'s Employee ID, OR their Biometric ID (device PIN). Either matches.'],
            ['   • Date         — REQUIRED. The workday. Use YYYY-MM-DD (e.g. 2026-07-14).'],
            ['   • Time In       — the clock-in time in 24-hour HH:MM (e.g. 08:01). "8:01 AM" also works.'],
            ['   • Time Out      — the clock-out time in 24-hour HH:MM (e.g. 17:05 = 5:05 PM).'],
            [''],
            ['RULES & TIPS'],
            ['   • Each row needs a Time In OR a Time Out (at least one). Leave the other blank if it wasn\'t captured.'],
            ['   • A night shift is fine: put the OUT time as-is (e.g. In 20:00, Out 05:00 belongs on the START date).'],
            ['   • Use 24-hour time to avoid AM/PM mistakes: 1:00 PM = 13:00, 5:00 PM = 17:00, midnight = 00:00.'],
            ['   • The Employee/Biometric ID must already exist in the chosen company, or the row is skipped with an error.'],
            ['   • After uploading, review the batch and Approve so the times post to the employees\' DTR.'],
        ];

        $path = tempnam(sys_get_temp_dir(), 'tltpl_').'.xlsx';
        $writer = new XlsxWriter();
        $writer->openToFile($path);

        $writer->getCurrentSheet()->setName('How to fill');
        foreach ($guide as $line) {
            $writer->addRow(Row::fromValues($line));
        }

        $writer->addNewSheetAndMakeItCurrent();
        $writer->getCurrentSheet()->setName('Time Logs');
        $writer->addRow(Row::fromValues($headers));
        foreach ($examples as $ex) {
            $writer->addRow(Row::fromValues($ex));
        }

        $writer->close();

        return response()
            ->download($path, 'attendance_time_log_upload_template.xlsx', [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])
            ->deleteFileAfterSend(true);
    }
}
