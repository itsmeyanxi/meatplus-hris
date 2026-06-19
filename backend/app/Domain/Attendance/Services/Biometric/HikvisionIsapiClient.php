<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\AttendanceDevice;
use Carbon\CarbonInterface;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * Thin client for Hikvision access-control terminals over ISAPI (HTTP + Digest auth).
 *
 * Only the two calls we need:
 *  - deviceInfo()   : connectivity / identity check
 *  - fetchEvents()  : paginated access-event search (AcsEvent), normalized to punches
 */
class HikvisionIsapiClient
{
    public function __construct(private readonly AttendanceDevice $device) {}

    /** GET /ISAPI/System/deviceInfo — returns the parsed device identity, or throws. */
    public function deviceInfo(): array
    {
        $res = $this->request()
            ->acceptJson()
            ->get($this->url('/ISAPI/System/deviceInfo?format=json'));

        $res->throw();

        $info = $res->json('DeviceInfo', []);

        return [
            'name' => $info['deviceName'] ?? null,
            'model' => $info['model'] ?? null,
            'serial' => $info['serialNumber'] ?? null,
            'firmware' => $info['firmwareVersion'] ?? null,
            'mac' => $info['macAddress'] ?? null,
        ];
    }

    /**
     * List the people enrolled on the device (their device "Employee No." + name).
     *
     * @return array<int, array{employee_no: string, name: ?string}>
     */
    public function fetchUsers(): array
    {
        $users = [];
        $position = 0;
        $pageSize = 30;

        for ($guard = 0; $guard < 1000; $guard++) {
            $res = $this->request()
                ->acceptJson()
                ->post($this->url('/ISAPI/AccessControl/UserInfo/Search?format=json'), [
                    'UserInfoSearchCond' => [
                        'searchID' => 'meatplus-hris',
                        'searchResultPosition' => $position,
                        'maxResults' => $pageSize,
                    ],
                ]);

            $res->throw();

            $body = $res->json('UserInfoSearch', []);
            $list = $body['UserInfo'] ?? [];

            foreach ($list as $u) {
                $no = trim((string) ($u['employeeNo'] ?? ''));
                if ($no !== '') {
                    $users[] = ['employee_no' => $no, 'name' => $u['name'] ?? null];
                }
            }

            $num = (int) ($body['numOfMatches'] ?? count($list));
            $status = $body['responseStatusStrg'] ?? 'OK';

            if ($status !== 'MORE' || $num === 0) {
                break;
            }
            $position += $num;
        }

        return $users;
    }

    /**
     * Fetch all access events in [from, to], following the device's pagination.
     * Returns a flat list of normalized punches (see normalize()).
     *
     * @return array<int, array<string, mixed>>
     */
    public function fetchEvents(CarbonInterface $from, CarbonInterface $to): array
    {
        $events = [];
        $position = 0;
        $pageSize = 50;

        // The device caps total iterations defensively (avoid a runaway loop).
        for ($guard = 0; $guard < 1000; $guard++) {
            $res = $this->request()
                ->acceptJson()
                ->post($this->url('/ISAPI/AccessControl/AcsEvent?format=json'), [
                    'AcsEventCond' => [
                        'searchID' => 'meatplus-hris',
                        'searchResultPosition' => $position,
                        'maxResults' => $pageSize,
                        'major' => 0, // 0 = all majors; we filter by person id in code
                        'minor' => 0,
                        'startTime' => $this->isoTime($from),
                        'endTime' => $this->isoTime($to),
                    ],
                ]);

            $res->throw();

            $body = $res->json('AcsEvent', []);
            $list = $body['InfoList'] ?? [];

            foreach ($list as $row) {
                $punch = $this->normalize($row);
                if ($punch !== null) {
                    $events[] = $punch;
                }
            }

            $num = (int) ($body['numOfMatches'] ?? count($list));
            $status = $body['responseStatusStrg'] ?? 'OK';

            // "MORE" => keep paging; "OK"/"NO MATCH" => done.
            if ($status !== 'MORE' || $num === 0) {
                break;
            }
            $position += $num;
        }

        return $events;
    }

    /**
     * Map one AcsEvent InfoList row to a punch, or null if it isn't an identified
     * person event (door-open, tamper, heartbeat, anonymous, etc.).
     *
     * @return array{person_id: string, time: string, event_id: string, status: ?string, name: ?string, raw: array}|null
     */
    private function normalize(array $row): ?array
    {
        $personId = trim((string) ($row['employeeNoString'] ?? $row['employeeNo'] ?? ''));
        $time = $row['time'] ?? null;

        if ($personId === '' || ! $time) {
            return null; // not an attributable punch
        }

        return [
            'person_id' => $personId,
            'time' => (string) $time, // ISO8601 with device offset, e.g. 2026-06-17T08:01:33+08:00
            'event_id' => (string) ($row['serialNo'] ?? ($personId.'@'.$time)),
            'status' => isset($row['attendanceStatus']) ? (string) $row['attendanceStatus'] : null,
            'name' => $row['name'] ?? null,
            'raw' => $row,
        ];
    }

    private function request(): PendingRequest
    {
        return Http::withDigestAuth($this->device->username, $this->device->password)
            ->connectTimeout(8)
            ->timeout(30)
            ->retry(2, 250);
    }

    private function url(string $path): string
    {
        return $this->device->baseUrl().$path;
    }

    /** ISAPI matches its own wall-clock; format the window in the device timezone. */
    private function isoTime(CarbonInterface $t): string
    {
        return $t->copy()->setTimezone($this->device->tz())->format('Y-m-d\TH:i:sP');
    }
}
