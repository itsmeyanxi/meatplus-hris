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
        abort_unless($request->user()->can('employee.create'), 403);

        $request->validate([
            'file' => ['required', 'file', 'max:5120'], // 5 MB
        ]);

        $file = $request->file('file');
        $ext = strtolower($file->getClientOriginalExtension());

        if (! in_array($ext, ['csv', 'txt', 'xlsx'], true)) {
            return response()->json([
                'message' => 'Unsupported file type. Upload a .csv or .xlsx file.',
            ], 422);
        }

        $result = $service->import(
            $file->getRealPath(),
            $ext === 'xlsx' ? 'xlsx' : 'csv',
            $request->user()->active_company_id,
        );

        return response()->json($result);
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
