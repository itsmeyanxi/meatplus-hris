<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Services\Biometric\HikvisionIsapiClient;
use Illuminate\Console\Command;

class AttendanceDeviceTest extends Command
{
    protected $signature = 'attendance:device-test {device : Device id}';

    protected $description = 'Check connectivity/credentials for a registered biometric device.';

    public function handle(): int
    {
        $device = AttendanceDevice::find($this->argument('device'));
        if (! $device) {
            $this->error('Device not found.');

            return self::FAILURE;
        }

        $this->info("Connecting to {$device->name} at {$device->baseUrl()} …");

        try {
            $info = (new HikvisionIsapiClient($device))->deviceInfo();
        } catch (\Throwable $e) {
            $this->error('FAILED: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info('OK — device reachable and credentials accepted.');
        foreach ($info as $k => $v) {
            $this->line(sprintf('  %-9s %s', ucfirst($k).':', $v ?? '—'));
        }

        return self::SUCCESS;
    }
}
