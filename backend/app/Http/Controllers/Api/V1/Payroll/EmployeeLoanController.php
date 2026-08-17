<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Services\LoanImportService;
use App\Domain\Identity\Models\Company;
use App\Domain\Payroll\Models\EmployeeLoan;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Options as XlsxOptions;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Recurring loan / amortized deductions. Managed by payroll staff; the running
 * balance is drawn down automatically when a payroll run that deducted it is posted.
 */
class EmployeeLoanController extends Controller
{
    private const TYPES = ['sss_salary', 'sss_calamity', 'pagibig_mpl', 'pagibig_calamity', 'company', 'cash_advance', 'other'];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);

        $q = EmployeeLoan::query()
            ->with('employee:id,employee_no,first_name,last_name')
            ->latest();

        if ($eid = $request->query('employee_id')) {
            $q->where('employee_id', (int) $eid);
        }
        if ($request->boolean('active_only')) {
            $q->where('is_active', true)->where('outstanding_balance', '>', 0);
        }

        return response()->json(['data' => $q->limit(500)->get()->map(fn ($l) => $this->shape($l))]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $data = $this->validateLoan($request);

        // Balance defaults to the principal when not supplied.
        $data['company_id'] = $request->user()->active_company_id;
        $data['outstanding_balance'] = $data['outstanding_balance'] ?? $data['principal'] ?? 0;

        $loan = EmployeeLoan::create($data);

        return response()->json(['data' => $this->shape($loan->load('employee:id,employee_no,first_name,last_name'))], 201);
    }

    public function update(Request $request, EmployeeLoan $loan): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $data = $this->validateLoan($request, false);
        $loan->update($data);

        return response()->json(['data' => $this->shape($loan->fresh()->load('employee:id,employee_no,first_name,last_name'))]);
    }

    public function destroy(Request $request, EmployeeLoan $loan): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $loan->delete();

        return response()->json(['message' => 'Loan deleted.']);
    }

    /** Bulk-import loans (e.g. an SSS/Pag-IBIG loan schedule) from CSV/XLSX. */
    public function import(Request $request, LoanImportService $service): JsonResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $request->validate(['file' => ['required', 'file', 'max:5120']]);
        $file = $request->file('file');
        $head = @file_get_contents($file->getRealPath(), false, null, 0, 8) ?: '';
        $ext = str_starts_with($head, "PK\x03\x04") ? 'xlsx' : (str_starts_with($head, "\xD0\xCF\x11\xE0") ? null : 'csv');
        if ($ext === null) {
            return response()->json(['message' => 'Unsupported file. Upload a .csv or .xlsx.'], 422);
        }

        return response()->json($service->import($file->getRealPath(), $ext, (int) $request->user()->active_company_id));
    }

    /** CSV template for the loan import — SSS + Pag-IBIG examples. */
    public function importTemplate(Request $request): StreamedResponse
    {
        abort_unless($request->user()->can('payroll.run'), 403);
        $headers = ['EmployeeID', 'LoanType', 'ReferenceNo', 'Principal', 'Amortization', 'OutstandingBalance', 'StartDate'];
        $examples = [
            ['2160067', 'SSS Salary Loan', 'SSS-2025-0012', '24000', '1000', '18000', '2025-03-01'],
            ['2160067', 'Pag-IBIG MPL', 'HDMF-2025-3345', '30000', '1250', '22500', '2025-04-01'],
        ];

        return response()->streamDownload(function () use ($headers, $examples) {
            $o = fopen('php://output', 'w');
            fputcsv($o, $headers);
            foreach ($examples as $ex) {
                fputcsv($o, $ex);
            }
            fclose($o);
        }, 'loan_import_template.csv', ['Content-Type' => 'text/csv']);
    }

    /** Loan-type code → the human label the importer recognises (so an export re-imports 1:1). */
    private const TYPE_LABEL = [
        'sss_salary' => 'SSS Salary Loan',
        'sss_calamity' => 'SSS Calamity Loan',
        'pagibig_mpl' => 'Pag-IBIG MPL',
        'pagibig_calamity' => 'Pag-IBIG Calamity',
        'company' => 'Company Loan',
        'cash_advance' => 'Cash Advance',
        'other' => 'Other',
    ];

    /** Loan-type code → the ledger sheet name (mirrors the source cash-advance file). */
    private const SHEET_NAME = [
        'cash_advance' => 'CASH ADVANCE',
        'sss_salary' => 'SSS LOANS',
        'sss_calamity' => 'SSS CALAMITY',
        'pagibig_mpl' => 'HDMF LOAN',
        'pagibig_calamity' => 'HDMF CALAMITY',
        'company' => 'COMPANY LOAN',
        'other' => 'OTHER',
    ];

    /**
     * Export the company's loans as a clean, formatted ledger workbook — one sheet
     * per loan type, each loan shown with its amortization schedule (installment,
     * schedule date, amount, deducted-so-far, running balance), mirroring the source
     * cash-advance file. Installments already covered by payments made are marked
     * deducted; the rest are the projected remaining schedule.
     */
    public function export(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('payroll.view'), 403);
        $companyId = $request->user()->active_company_id;
        $company = Company::find($companyId);
        $companyName = $company?->legal_name ?: ($company?->code ?: 'Company');

        $loans = EmployeeLoan::query()
            ->with('employee:id,employee_no,first_name,last_name')
            ->orderBy('type')->orderBy('employee_id')->orderBy('start_date')
            ->get()
            ->groupBy('type');

        // Styles.
        $title = (new Style())->withFontBold(true)->withFontSize(13)->withFontColor('1E293B');
        $head = (new Style())->withFontBold(true)->withFontColor(Color::WHITE)->withBackgroundColor('1E293B');
        $loanHead = (new Style())->withFontBold(true)->withBackgroundColor('E2E8F0');

        // Semi-monthly (5th / 20th) schedule dates from a start date.
        $genDates = function (?Carbon $start, int $n): array {
            if (! $start || $n <= 0) {
                return array_fill(0, max(0, $n), null);
            }
            $cur = $start->copy()->day(5);
            if ($cur->lt($start)) $cur = $start->copy()->day(20);
            if ($cur->lt($start)) $cur = $start->copy()->addMonth()->day(5);
            $out = [];
            for ($i = 0; $i < $n; $i++) {
                $out[] = $cur->copy();
                $cur = $cur->day === 5 ? $cur->copy()->day(20) : $cur->copy()->addMonthNoOverflow()->day(5);
            }

            return $out;
        };

        $cols = ['Entry Date', 'Employee No.', 'Name', 'Reference', 'Loan', 'No', 'Payment Sched', 'Amount', 'Date Deducted', 'Payment', 'Balance', 'Remarks'];

        $opt = new XlsxOptions();
        $opt->setColumnWidth(12, 1, 7, 9);      // dates
        $opt->setColumnWidth(14, 2);            // employee no
        $opt->setColumnWidth(26, 3);            // name
        $opt->setColumnWidth(20, 4);            // reference
        $opt->setColumnWidth(12, 5, 8, 10, 11); // money
        $opt->setColumnWidth(20, 12);           // remarks

        $path = tempnam(sys_get_temp_dir(), 'loanledger_').'.xlsx';
        $writer = new XlsxWriter($opt);
        $writer->openToFile($path);
        $first = true;

        foreach (self::SHEET_NAME as $type => $sheetName) {
            $group = $loans->get($type);
            if (! $group || $group->isEmpty()) {
                continue;
            }
            if ($first) {
                $writer->getCurrentSheet()->setName($sheetName);
                $first = false;
            } else {
                $writer->addNewSheetAndMakeItCurrent();
                $writer->getCurrentSheet()->setName($sheetName);
            }

            $writer->addRow(Row::fromValuesWithStyle([$companyName], $title));
            $writer->addRow(Row::fromValuesWithStyle([self::TYPE_LABEL[$type] ?? $type], $title));
            $writer->addRow(Row::fromValues([]));
            $writer->addRow(Row::fromValuesWithStyle($cols, $head));

            foreach ($group as $l) {
                $name = Employee::formatName($l->employee?->first_name, $l->employee?->last_name);
                $empNo = (string) ($l->employee?->employee_no ?? '');
                $ref = (string) ($l->reference_no ?? '');
                $principal = round((float) $l->principal, 2);
                $amort = round((float) $l->amortization, 2);
                $outstanding = round((float) $l->outstanding_balance, 2);
                $n = $amort > 0 ? (int) ceil($principal / $amort) : 0;
                $paid = max(0, $principal - $outstanding);
                $paidCount = $amort > 0 ? min($n, (int) round($paid / $amort)) : 0;
                $dates = $genDates($l->start_date ? $l->start_date->copy() : null, $n);
                $remark = $outstanding <= 0 ? 'Fully Paid - Closed' : ($l->is_active ? 'Deduction on Going' : 'Paused');

                // Loan header row (principal + starting balance).
                $writer->addRow(Row::fromValuesWithStyle([
                    $l->start_date?->toDateString() ?? '', $empNo, $name, $ref, $principal, '', '', '', '', '', $principal, $remark,
                ], $loanHead));

                // Installment schedule.
                $bal = $principal;
                for ($i = 1; $i <= $n; $i++) {
                    $amt = $i < $n ? $amort : round($principal - ($n - 1) * $amort, 2);
                    $bal = round($bal - $amt, 2);
                    $isPaid = $i <= $paidCount;
                    $d = $dates[$i - 1] ?? null;
                    $ds = $d ? $d->toDateString() : '';
                    $writer->addRow(Row::fromValues([
                        '', $empNo, $name, $ref, '', $i, $ds, -$amt, $isPaid ? $ds : '', $isPaid ? -$amt : '', $bal, $remark,
                    ]));
                }
            }
        }

        if ($first) {
            // No loans at all — still produce a valid, non-empty workbook.
            $writer->getCurrentSheet()->setName('Loans');
            $writer->addRow(Row::fromValuesWithStyle([$companyName.' — no loans on record'], $title));
        }

        $writer->close();

        $slug = \Illuminate\Support\Str::slug($company?->code ?: 'company');

        return response()
            ->download($path, "{$slug}_loans_ledger_".now()->format('Ymd').'.xlsx', [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])
            ->deleteFileAfterSend(true);
    }

    private function validateLoan(Request $request, bool $creating = true): array
    {
        return $request->validate([
            'employee_id' => [$creating ? 'required' : 'sometimes', 'integer', 'exists:employees,id'],
            'type' => [$creating ? 'required' : 'sometimes', 'in:'.implode(',', self::TYPES)],
            'reference_no' => ['nullable', 'string', 'max:60'],
            'principal' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'amortization' => [$creating ? 'required' : 'sometimes', 'numeric', 'min:0', 'max:100000000'],
            'outstanding_balance' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
            'start_date' => ['nullable', 'date'],
            'is_active' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function shape(EmployeeLoan $l): array
    {
        return [
            'id' => $l->id,
            'employee' => $l->employee ? [
                'id' => $l->employee->id,
                'employee_no' => $l->employee->employee_no,
                'name' => $l->employee->full_name,
            ] : null,
            'employee_id' => $l->employee_id,
            'type' => $l->type,
            'reference_no' => $l->reference_no,
            'principal' => (float) $l->principal,
            'amortization' => (float) $l->amortization,
            'outstanding_balance' => (float) $l->outstanding_balance,
            'start_date' => $l->start_date?->toDateString(),
            'is_active' => (bool) $l->is_active,
            'notes' => $l->notes,
        ];
    }
}
