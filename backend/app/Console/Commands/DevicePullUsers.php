<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Models\AttendanceDevice;
use Illuminate\Console\Command;

/**
 * Queues a one-shot ADMS "DATA QUERY USERINFO" command so the device uploads its
 * enrolled-user list (on-device User ID → Name). The list lands in
 * storage/app/device_users/{serial}.json for reconciling against HRIS biometric IDs.
 */
class DevicePullUsers extends Command
{
    protected $signature = 'device:pull-users {serial : Device serial}';

    protected $description = 'Ask a device to upload its enrolled-user list (User ID -> Name).';

    public function handle(): int
    {
        $device = AttendanceDevice::query()->withoutGlobalScopes()
            ->where('serial_no', $this->argument('serial'))
            ->where('is_active', true)
            ->first();

        if (! $device) {
            $this->error('No active device with that serial.');

            return self::FAILURE;
        }

        $device->forceFill(['pending_command' => 'C:'.time().$device->id.':DATA QUERY USERINFO'])->save();

        $this->info("Queued user-list pull for {$device->name} [{$device->serial_no}].");
        $this->line("After its next poll (~30s), the list will be at storage/app/device_users/{$device->serial_no}.json");

        return self::SUCCESS;
    }
}
