<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Models\AttendanceDevice;
use Illuminate\Console\Command;

/**
 * Queues a one-shot ADMS "DATA QUERY ATTLOG" command on a device (or all active
 * devices). On its next poll the device re-uploads every stored punch in the
 * range; ingestion dedups, so existing punches are ignored and only gaps fill.
 */
class DeviceResync extends Command
{
    protected $signature = 'device:resync
        {serial? : Device serial to target; omit for ALL active devices}
        {--from= : Start date YYYY-MM-DD (default 2020-01-01)}';

    protected $description = 'Tell device(s) to re-upload their stored attendance history (old data). Duplicates are ignored.';

    public function handle(): int
    {
        $query = AttendanceDevice::query()->withoutGlobalScopes()->where('is_active', true);
        if ($serial = $this->argument('serial')) {
            $query->where('serial_no', $serial);
        }
        $devices = $query->get();

        if ($devices->isEmpty()) {
            $this->error('No matching active device found.');

            return self::FAILURE;
        }

        $from = ($this->option('from') ?: '2020-01-01').' 00:00:00';
        $to = now()->format('Y-m-d H:i:s');

        foreach ($devices as $device) {
            $command = "C:".time().$device->id.":DATA QUERY ATTLOG StartTime={$from}\tEndTime={$to}";
            $device->forceFill(['pending_command' => $command])->save();
            $this->info("Queued re-sync ({$from} -> {$to}) for {$device->name} [{$device->serial_no}]");
        }

        $this->line('Devices fetch this on their next poll (~30s) and re-upload stored punches. Existing punches are ignored (dedup).');

        return self::SUCCESS;
    }
}
