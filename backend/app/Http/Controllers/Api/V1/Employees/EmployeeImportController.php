<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Services\EmployeeImportService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

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

        $result = $service->import($path, $format, (int) $companyId);

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

    /** Download a CSV template with the expected headers + one example row. */
    public function template(Request $request): StreamedResponse
    {
        abort_unless($request->user()->can('employee.create'), 403);

        $headers = ['Employee ID', 'Last Name', 'Middle Name', 'First Name', 'Gender', 'Civil Status', 'Department', 'Location', 'Email', 'Position', 'Employment Type', 'Date Hired', 'Birth Date'];
        $example = ['EMP-1001', 'Dela Cruz', 'Santos', 'Juan', 'Male', 'Single', 'Operations', 'Head Office', 'juan.delacruz@meatplus.ph', 'Warehouse Staff', 'Regular', '2020-05-01', '1995-03-12'];

        return response()->streamDownload(function () use ($headers, $example) {
            $out = fopen('php://output', 'w');
            fputcsv($out, $headers);
            fputcsv($out, $example);
            fclose($out);
        }, 'employee_import_template.csv', ['Content-Type' => 'text/csv']);
    }
}
