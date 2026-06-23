<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\Payroll\Models\PayrollRun;
use App\Domain\Payroll\Services\PayrollComputer;
use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\StorePayrollRunRequest;
use App\Http\Resources\Payroll\PayrollRunResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;

class PayrollRunController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('payroll.view'), 403);

        $runs = PayrollRun::query()
            ->withCount('payslips')
            ->withSum('payslips', 'gross_pay')
            ->withSum('payslips', 'net_pay')
            ->orderByDesc('period_end')
            ->get();

        return PayrollRunResource::collection($runs);
    }

    public function store(StorePayrollRunRequest $request): JsonResponse
    {
        $run = PayrollRun::create([
            ...$request->validated(),
            'company_id' => $request->user()->active_company_id,
            'status' => 'draft',
            'created_by_user_id' => $request->user()->id,
        ]);

        return (new PayrollRunResource($run))->response()->setStatusCode(201);
    }

    public function show(Request $request, PayrollRun $payrollRun): PayrollRunResource
    {
        abort_unless($request->user()->can('payroll.view'), 403);

        $payrollRun->load(['payslips' => fn ($q) => $q->with('employee:id,employee_no,first_name,last_name')])
            ->loadCount('payslips')
            ->loadSum('payslips', 'gross_pay')
            ->loadSum('payslips', 'net_pay');

        return new PayrollRunResource($payrollRun);
    }

    /** Generate/refresh payslips for the run from compensation + attendance. */
    public function compute(Request $request, PayrollRun $payrollRun, PayrollComputer $computer): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $this->assertStatus($payrollRun, ['draft', 'computed'], 'compute');

        $summary = $computer->computeRun($payrollRun);

        return response()->json(['message' => 'Payroll computed.', 'summary' => $summary]);
    }

    public function approve(Request $request, PayrollRun $payrollRun): PayrollRunResource
    {
        abort_unless($request->user()->can('payroll.approve'), 403);
        $this->assertStatus($payrollRun, ['computed'], 'approve');

        $payrollRun->forceFill(['status' => 'approved', 'approved_at' => now()])->save();

        return new PayrollRunResource($payrollRun);
    }

    public function post(Request $request, PayrollRun $payrollRun): PayrollRunResource
    {
        abort_unless($request->user()->can('payroll.post'), 403);
        $this->assertStatus($payrollRun, ['approved'], 'post');

        $payrollRun->forceFill(['status' => 'posted', 'posted_at' => now()])->save();

        return new PayrollRunResource($payrollRun);
    }

    public function destroy(Request $request, PayrollRun $payrollRun): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);

        if ($payrollRun->status === 'posted') {
            throw ValidationException::withMessages(['status' => 'A posted payroll run cannot be deleted.']);
        }

        $payrollRun->delete();

        return response()->json(['message' => 'Payroll run deleted.']);
    }

    /** @param array<int,string> $allowed */
    private function assertStatus(PayrollRun $run, array $allowed, string $action): void
    {
        if (! in_array($run->status, $allowed, true)) {
            throw ValidationException::withMessages([
                'status' => "Cannot {$action} a run that is {$run->status}.",
            ]);
        }
    }
}
