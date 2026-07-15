<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Services\Biometric\BiometricSyncService;
use App\Domain\Attendance\Services\Biometric\HikvisionIsapiClient;
use App\Domain\Identity\Models\Company;
use App\Models\User;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\AttendanceDeviceRequest;
use App\Http\Resources\Attendance\AttendanceDeviceResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AttendanceDeviceController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('device.manage'), 403);

        return AttendanceDeviceResource::collection(
            AttendanceDevice::orderBy('name')->get(),
        );
    }

    public function store(AttendanceDeviceRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['company_id'] = $this->resolveCompanyId($request->user(), $data['company_id'] ?? null);
        $data['port'] = $data['port'] ?? 80;
        $data['timezone'] = $data['timezone'] ?? 'Asia/Manila';

        $device = AttendanceDevice::create($data);

        return (new AttendanceDeviceResource($device))->response()->setStatusCode(201);
    }

    public function show(Request $request, AttendanceDevice $attendanceDevice): AttendanceDeviceResource
    {
        abort_unless($request->user()->can('device.manage'), 403);

        return new AttendanceDeviceResource($attendanceDevice);
    }

    public function update(AttendanceDeviceRequest $request, AttendanceDevice $attendanceDevice): AttendanceDeviceResource
    {
        $data = $request->validated();

        // Blank password on update = keep the stored credential.
        if (empty($data['password'])) {
            unset($data['password']);
        }

        // Only reassign company when explicitly chosen and permitted; a blank/absent
        // value must not null out the existing company (NOT NULL) or move it silently.
        if (! empty($data['company_id'])) {
            $data['company_id'] = $this->resolveCompanyId($request->user(), (int) $data['company_id']);
        } else {
            unset($data['company_id']);
        }

        $attendanceDevice->update($data);

        return new AttendanceDeviceResource($attendanceDevice->fresh());
    }

    /** Companies this user may assign a device to: all for it_admin, else their own. */
    private function allowedCompanyIds(User $user): array
    {
        return $user->hasRole('it_admin')
            ? Company::query()->pluck('id')->all()
            : $user->companies()->pluck('companies.id')->all();
    }

    /** Resolve the target company: the requested one if permitted, else the active company. */
    private function resolveCompanyId(User $user, ?int $requested): int
    {
        if (! $requested) {
            return $user->active_company_id;
        }

        abort_unless(
            in_array($requested, $this->allowedCompanyIds($user), true),
            403,
            'You cannot assign a device to that company.',
        );

        return $requested;
    }

    public function destroy(Request $request, AttendanceDevice $attendanceDevice): JsonResponse
    {
        abort_unless($request->user()->can('device.manage'), 403);

        $attendanceDevice->delete();

        return response()->json(['message' => 'Device removed.']);
    }

    /** Connectivity + credential check against the live device. */
    public function test(Request $request, AttendanceDevice $attendanceDevice): JsonResponse
    {
        abort_unless($request->user()->can('device.manage'), 403);

        try {
            $info = (new HikvisionIsapiClient($attendanceDevice))->deviceInfo();
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        }

        // Opportunistically capture the serial if we didn't have it.
        if (! $attendanceDevice->serial_no && ($info['serial'] ?? null)) {
            $attendanceDevice->forceFill(['serial_no' => $info['serial']])->save();
        }

        return response()->json(['ok' => true, 'info' => $info]);
    }

    /** List people enrolled on the device, each cross-referenced to an HRIS employee. */
    public function users(Request $request, AttendanceDevice $attendanceDevice): JsonResponse
    {
        abort_unless($request->user()->can('device.manage'), 403);

        try {
            $deviceUsers = (new HikvisionIsapiClient($attendanceDevice))->fetchUsers();
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        }

        $companyId = $attendanceDevice->company_id;
        $users = array_map(function (array $u) use ($companyId) {
            $match = \App\Domain\HRIS\Models\Employee::query()
                ->where('company_id', $companyId)
                ->where(fn ($q) => $q
                    ->where('biometric_user_id', $u['employee_no'])
                    ->orWhere('employee_no', $u['employee_no']))
                ->orderByRaw('biometric_user_id = ? desc', [$u['employee_no']])
                ->first(['id', 'employee_no', 'first_name', 'last_name']);

            return [
                'device_employee_no' => $u['employee_no'],
                'device_name' => $u['name'],
                'matched_employee' => $match ? [
                    'id' => $match->id,
                    'employee_no' => $match->employee_no,
                    'name' => $match->full_name,
                ] : null,
            ];
        }, $deviceUsers);

        return response()->json(['ok' => true, 'users' => $users]);
    }

    /** Pull punches now (the scheduler also does this every 5 minutes). */
    public function sync(Request $request, AttendanceDevice $attendanceDevice, BiometricSyncService $service): JsonResponse
    {
        abort_unless($request->user()->can('device.manage'), 403);

        try {
            $summary = $service->sync($attendanceDevice);
        } catch (\Throwable $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()], 422);
        }

        return response()->json(['ok' => true, 'summary' => $summary]);
    }
}
