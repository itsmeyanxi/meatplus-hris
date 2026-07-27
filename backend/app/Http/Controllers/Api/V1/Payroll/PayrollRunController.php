<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\HRIS\Models\EmployeeBankAccount;
use App\Domain\Payroll\Models\PayrollRun;
use App\Domain\Payroll\Services\PayrollComputer;
use App\Http\Controllers\Controller;
use App\Http\Requests\Payroll\StorePayrollRunRequest;
use App\Http\Resources\Payroll\PayrollRunResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\StreamedResponse;
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

    public function post(Request $request, PayrollRun $payrollRun, PayrollComputer $computer): PayrollRunResource
    {
        abort_unless($request->user()->can('payroll.post'), 403);
        $this->assertStatus($payrollRun, ['approved'], 'post');

        // Draw loan amortizations off their balances (once — posting is terminal).
        $computer->drawDownLoans($payrollRun);

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

    /**
     * Bank disbursement file: one row per employee with their primary account and
     * net pay, for uploading to the bank's payroll-crediting portal. Available once
     * the run is computed (numbers exist); typically pulled after approval.
     */
    public function bankFile(Request $request, PayrollRun $payrollRun): StreamedResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);

        $payrollRun->load(['payslips.employee:id,employee_no,first_name,last_name']);
        abort_if($payrollRun->payslips->isEmpty(), 404, 'This run has no payslips yet — compute it first.');

        // Primary bank account per employee (account_number decrypts via the model).
        $accounts = EmployeeBankAccount::query()
            ->whereIn('employee_id', $payrollRun->payslips->pluck('employee_id'))
            ->where('is_primary', true)
            ->get()
            ->keyBy('employee_id');

        $filename = 'bankfile_'.str_replace(' ', '_', $payrollRun->name).'.csv';

        return response()->streamDownload(function () use ($payrollRun, $accounts) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Employee No', 'Account Name', 'Bank', 'Account Number', 'Net Pay', 'Status']);
            foreach ($payrollRun->payslips as $slip) {
                $acct = $accounts->get($slip->employee_id);
                fputcsv($out, [
                    $slip->employee?->employee_no ?? '',
                    $acct?->account_name ?: $slip->employee?->full_name ?? '',
                    $acct?->bank_name ?? '',
                    $acct?->account_number ?? '',
                    number_format((float) $slip->net_pay, 2, '.', ''),
                    $acct ? 'OK' : 'NO BANK ACCOUNT',
                ]);
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
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
