<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Services\EmployeeImportService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class EmployeeImportController extends Controller
{
    /** Upload a CSV/XLSX and bulk-create employees. */
    public function store(Request $request, EmployeeImportService $service): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('employee.create'), 403);

        $data = $request->validate([
            'file' => ['required', 'file', 'max:5120'], // 5 MB
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            // When set, imported rows are treated as AGENCY workers: the branches
            // they map to are flagged is_agency, so they appear in the Agencies
            // module and are kept out of the organic Employees list.
            'as_agency' => ['nullable', 'boolean'],
            // Like as_agency, but flags branches is_project_crew so rows land in the
            // Project Crews module (PASEI internal project-based crews).
            'as_project_crew' => ['nullable', 'boolean'],
            // When set (per-agency bulk upload), every imported row is assigned to
            // this branch — the file needs no Branch column.
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
        ]);

        // Import into the chosen company (so admins don't have to switch active
        // company), defaulting to the current one. Non-admins can only target a
        // company they belong to.
        $companyId = $data['company_id'] ?? $user->active_company_id;
        if ((int) $companyId !== (int) $user->active_company_id && ! $user->hasRole('it_admin')) {
            $member = $user->companies()->where('companies.id', $companyId)->exists();
            abort_unless($member, 403, 'You cannot import into that company.');
        }

        $file = $request->file('file');
        $ext = strtolower($file->getClientOriginalExtension());
        $path = $file->getRealPath();

        // Many HR systems export ".xls" files that are really OOXML (xlsx) or CSV.
        // Sniff the content so those still import instead of being rejected.
        $format = $this->detectFormat($path, $ext);
        if ($format === null) {
            return response()->json([
                'message' => 'Unsupported file type. Upload a .csv or .xlsx (or an .xls saved in either format).',
            ], 422);
        }

        // If a branch is pinned, it must belong to the target company.
        $forceBranchId = null;
        if (! empty($data['branch_id'])) {
            $branch = \App\Domain\Identity\Models\Branch::query()->find($data['branch_id']);
            abort_unless($branch && (int) $branch->company_id === (int) $companyId, 422, 'That branch is not in the chosen company.');
            $forceBranchId = (int) $branch->id;
        }

        $result = $service->import($path, $format, (int) $companyId, (bool) ($data['as_agency'] ?? false), $forceBranchId, (bool) ($data['as_project_crew'] ?? false));

        return response()->json($result);
    }

    /** Decide how to read the file from its actual bytes, not just its name. */
    private function detectFormat(string $path, string $ext): ?string
    {
        $head = @file_get_contents($path, false, null, 0, 8) ?: '';

        // ZIP signature => OOXML .xlsx (also catches .xls files that are really xlsx).
        if (str_starts_with($head, "PK\x03\x04")) {
            return 'xlsx';
        }
        // Legacy OLE2 binary .xls — the reader can't parse it.
        if (str_starts_with($head, "\xD0\xCF\x11\xE0")) {
            return null;
        }
        // Anything else that looks like a spreadsheet/text export: treat as CSV.
        if (in_array($ext, ['csv', 'txt', 'xls', ''], true)) {
            return 'csv';
        }

        return null;
    }

    /**
     * Download a ready-to-fill Excel template: a "How to fill" guide sheet plus an
     * "Employees" sheet whose header row matches the importer. Biometric-essential
     * columns (Employee ID, Biometric ID, name, Branch) come first so preparing a
     * biometric upload is obvious. Extra columns (gov IDs, salary) are also
     * accepted by the importer even though they're not on this template.
     */
    public function template(Request $request): BinaryFileResponse
    {
        abort_unless($request->user()->can('employee.create'), 403);

        // Column order: the biometric essentials up front, HR details after.
        $headers = [
            'Employee ID', 'Biometric ID', 'Last Name', 'First Name', 'Middle Name',
            'Branch', 'Department', 'Position', 'Employment Type',
            'Gender', 'Civil Status', 'Date Hired', 'Birth Date', 'Email',
        ];
        // Worked examples mirroring an agency biometric roster (Employee ID may
        // equal the device PIN; leave any unknown cell blank — blanks are ignored).
        $examples = [
            ['5', '5', 'Suing', 'Jeric', '', 'EAA', '', '', '', 'Male', 'Single', '', '', ''],
            ['6', '6', 'Jatulan', 'Justine', '', 'EAA', '', '', '', 'Female', 'Single', '', '', ''],
            ['9', '9', 'Celedonio', 'Jayson', '', 'ATC', '', '', '', 'Male', 'Married', '', '', ''],
            ['EMP-1001', '5', 'Dela Cruz', 'Juan', 'Santos', 'Head Office', 'Operations', 'Warehouse Staff', 'Regular', 'Male', 'Single', '2020-05-01', '1995-03-12', 'juan.delacruz@meatplus.ph'],
        ];

        $guide = [
            ['ALL COMPANY HRIS — Employee / Biometric Upload Template'],
            [''],
            ['HOW TO USE'],
            ['1. Fill in the "Employees" tab (second tab below). One row per person.'],
            ['2. Save the file, then in the app go to Employees > Import, pick the company, and upload it.'],
            ['3. You may upload .xlsx or .csv. Column order does not matter — only the header names do.'],
            [''],
            ['REQUIRED COLUMNS (must be filled for every row)'],
            ['   • Employee ID   — the person\'s unique ID in this company. Reused ID = update, not a new person.'],
            ['   • Last Name'],
            ['   • First Name'],
            [''],
            ['FOR BIOMETRIC DATA (so device punches map to the right person)'],
            ['   • Biometric ID  — the User ID / PIN enrolled on the fingerprint or face device.'],
            ['                     It must match the number on the device exactly. Often the same as Employee ID.'],
            ['   • Branch        — the site/agency the worker belongs to (for PASEI this is the AGENCY, e.g. EAA,'],
            ['                     Golden 5, Stellar, ATC). A new Branch name is created automatically.'],
            [''],
            ['OPTIONAL COLUMNS (leave blank if unknown — a blank never erases existing data)'],
            ['   • Middle Name, Department, Position, Employment Type, Gender, Civil Status, Date Hired, Birth Date, Email'],
            [''],
            ['RULES & TIPS'],
            ['   • Dates: use YYYY-MM-DD (e.g. 2026-07-29).'],
            ['   • Gender: Male / Female.   Civil Status: Single / Married / Widowed / Separated.'],
            ['   • Department, Position, Employment Type and Branch are created on the fly if the name is new.'],
            ['   • Re-uploading the same file is safe: existing IDs are updated, blank cells are left untouched.'],
            ['   • The importer also accepts SSS, TIN, PhilHealth, Pag-IBIG and Base Salary columns if you add them.'],
        ];

        $path = tempnam(sys_get_temp_dir(), 'emptpl_').'.xlsx';
        $writer = new XlsxWriter();
        $writer->openToFile($path);

        $writer->getCurrentSheet()->setName('How to fill');
        foreach ($guide as $line) {
            $writer->addRow(Row::fromValues($line));
        }

        $writer->addNewSheetAndMakeItCurrent();
        $writer->getCurrentSheet()->setName('Employees');
        $writer->addRow(Row::fromValues($headers));
        foreach ($examples as $ex) {
            $writer->addRow(Row::fromValues($ex));
        }

        $writer->close();

        return response()
            ->download($path, 'employee_biometric_upload_template.xlsx', [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ])
            ->deleteFileAfterSend(true);
    }
}
