<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeBankAccount;
use App\Http\Controllers\Controller;
use App\Http\Requests\Employees\BankAccountRequest;
use App\Http\Resources\Employees\BankAccountResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BankAccountController extends Controller
{
    public function index(Request $request, Employee $employee): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('employee.view'), 403);

        return BankAccountResource::collection(
            $employee->bankAccounts()->orderByDesc('is_primary')->orderBy('bank_name')->get(),
        );
    }

    public function store(BankAccountRequest $request, Employee $employee): JsonResponse
    {
        $account = $employee->bankAccounts()->create($request->validated());

        return (new BankAccountResource($account))->response()->setStatusCode(201);
    }

    public function destroy(Request $request, Employee $employee, EmployeeBankAccount $bankAccount): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $bankAccount->delete();

        return response()->json(['message' => 'Bank account removed.']);
    }
}
