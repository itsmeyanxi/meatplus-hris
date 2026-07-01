<?php

namespace App\Http\Controllers\Api\V1\Companies;

use App\Domain\Identity\Models\Company;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CompanyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('it_admin'), 403);

        $companies = Company::query()
            ->withCount('users')
            ->orderBy('legal_name')
            ->get();

        return response()->json([
            'data' => $companies->map(fn ($c) => $this->format($c)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('it_admin'), 403);

        $data = $request->validate([
            'code'       => ['required', 'string', 'max:20', 'unique:companies,code'],
            'legal_name' => ['required', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'is_active'  => ['boolean'],
        ]);

        $company = Company::create($data);

        return response()->json(['data' => $this->format($company)], 201);
    }

    public function show(Request $request, Company $company): JsonResponse
    {
        abort_unless($request->user()->hasRole('it_admin'), 403);

        $company->loadCount('users');

        return response()->json(['data' => $this->format($company)]);
    }

    public function update(Request $request, Company $company): JsonResponse
    {
        abort_unless($request->user()->hasRole('it_admin'), 403);

        $data = $request->validate([
            'code'       => ['sometimes', 'string', 'max:20', 'unique:companies,code,' . $company->id],
            'legal_name' => ['sometimes', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'is_active'  => ['boolean'],
        ]);

        $company->update($data);

        return response()->json(['data' => $this->format($company)]);
    }

    private function format(Company $company): array
    {
        return [
            'id'          => $company->id,
            'code'        => $company->code,
            'legal_name'  => $company->legal_name,
            'trade_name'  => $company->trade_name,
            'name'        => $company->trade_name ?: $company->legal_name,
            'is_active'   => $company->is_active,
            'users_count' => $company->users_count ?? null,
        ];
    }
}
