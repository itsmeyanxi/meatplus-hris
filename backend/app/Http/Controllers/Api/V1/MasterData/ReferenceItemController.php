<?php

namespace App\Http\Controllers\Api\V1\MasterData;

use App\Domain\HRIS\Models\ReferenceItem;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Generic master-data lists (asset types, visa types, benefit types, work
 * locations …). The category comes from the route and must be one of a fixed
 * allowlist so callers can't invent arbitrary buckets.
 */
class ReferenceItemController extends Controller
{
    private const CATEGORIES = ['asset_type', 'visa_type', 'benefit_type', 'work_location'];

    private function assertCategory(string $category): void
    {
        if (! in_array($category, self::CATEGORIES, true)) {
            throw ValidationException::withMessages(['category' => 'Unknown reference list.']);
        }
    }

    public function index(Request $request, string $category): JsonResponse
    {
        abort_unless($request->user()->can('employee.view'), 403);
        $this->assertCategory($category);

        $items = ReferenceItem::query()
            ->where('category', $category)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'description', 'is_active', 'sort_order']);

        return response()->json(['data' => $items]);
    }

    public function store(Request $request, string $category): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);
        $this->assertCategory($category);

        $data = $this->validated($request, $category, null);
        $item = ReferenceItem::create([...$data, 'category' => $category]);

        return response()->json(['data' => $item], 201);
    }

    public function update(Request $request, string $category, ReferenceItem $referenceItem): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);
        $this->assertCategory($category);
        abort_if($referenceItem->category !== $category, 404);

        $referenceItem->update($this->validated($request, $category, $referenceItem->id));

        return response()->json(['data' => $referenceItem]);
    }

    public function destroy(Request $request, string $category, ReferenceItem $referenceItem): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);
        $this->assertCategory($category);
        abort_if($referenceItem->category !== $category, 404);

        $referenceItem->delete();

        return response()->json(['message' => 'Removed.']);
    }

    private function validated(Request $request, string $category, ?int $ignoreId): array
    {
        return $request->validate([
            'name' => [
                'required', 'string', 'max:150',
                Rule::unique('reference_items', 'name')
                    ->where('category', $category)
                    ->ignore($ignoreId),
            ],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer'],
        ]);
    }
}
