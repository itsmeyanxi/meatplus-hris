<?php

namespace App\Http\Controllers\Api\V1\Employees;

use App\Domain\HRIS\Models\Employee;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class PhotoController extends Controller
{
    /** Stream the photo back as an image so an <img> tag can point straight at it. */
    public function show(Request $request, Employee $employee): Response
    {
        abort_unless($request->user()->can('employee.view'), 403);

        $photo = $employee->photo;
        abort_unless($photo, 404);

        return response($photo->bytes(), 200, [
            'Content-Type' => $photo->mime,
            'Content-Length' => (string) $photo->size_bytes,
            'Cache-Control' => 'private, max-age=300',
        ]);
    }

    public function store(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $request->validate([
            'photo' => ['required', 'image', 'mimes:jpeg,jpg,png,webp', 'max:2048'], // KB
        ]);

        $file = $request->file('photo');

        $employee->photo()->updateOrCreate(
            ['employee_id' => $employee->id],
            [
                'mime' => $file->getMimeType(),
                'size_bytes' => $file->getSize(),
                'data' => base64_encode(file_get_contents($file->getRealPath())),
            ],
        );

        // photo_path is what the employee resource exposes; point it at the route.
        $employee->forceFill(['photo_path' => "api/v1/employees/{$employee->id}/photo"])->save();

        return response()->json([
            'message' => 'Photo uploaded.',
            'photo_url' => "/api/v1/employees/{$employee->id}/photo",
        ], 201);
    }

    public function destroy(Request $request, Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('employee.update'), 403);

        $employee->photo()?->delete();
        $employee->forceFill(['photo_path' => null])->save();

        return response()->json(['message' => 'Photo removed.']);
    }
}
