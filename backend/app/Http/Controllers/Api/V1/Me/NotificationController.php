<?php

namespace App\Http\Controllers\Api\V1\Me;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $items = $user->notifications()->latest()->limit(30)->get()->map(function ($n) {
            // Defensive decode: Eloquent's array cast returns an array normally,
            // but a double-encoded row (or a JSONB-typed column) yields a string.
            $data = is_array($n->data) ? $n->data : (json_decode($n->data, true) ?? []);

            return [
                'id'         => $n->id,
                'type'       => $data['type'] ?? null,
                'title'      => $data['title'] ?? 'Notification',
                'message'    => $data['message'] ?? '',
                'url'        => $data['url'] ?? null,
                'read_at'    => $n->read_at,
                'created_at' => $n->created_at,
            ];
        });

        return response()->json([
            'data' => $items,
            'unread' => $user->unreadNotifications()->count(),
        ]);
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        $request->user()->notifications()->findOrFail($id)->markAsRead();

        return response()->json(['message' => 'ok']);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return response()->json(['message' => 'ok']);
    }
}
