<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Services\Biometric\BiometricSyncService;
use Illuminate\Console\Command;

class SyncBiometricAttendance extends Command
{
    protected $signature = 'attendance:sync-biometric
        {--device= : Sync only this device id (default: all active devices)}';

    protected $description = 'Pull punches from biometric terminals into time logs and recompute DTRs.';

    public function handle(BiometricSyncService $service): int
    {
        $devices = AttendanceDevice::query()
            ->when($this->option('device'), fn ($q, $id) => $q->whereKey($id))
            ->when(! $this->option('device'), fn ($q) => $q->where('is_active', true))
            ->get();

        if ($devices->isEmpty()) {
            $this->warn('No devices to sync.');

            return self::SUCCESS;
        }

        $failures = 0;

        foreach ($devices as $device) {
            $this->info("Syncing {$device->name} (#{$device->id}) …");

            try {
                $s = $service->sync($device);
                $this->line("  window:    {$s['window'][0]} → {$s['window'][1]}");
                $this->line("  events:    {$s['events_seen']} seen, {$s['inserted']} new, {$s['duplicates']} dup");
                $this->line("  recompute: {$s['employees_recomputed']} employee(s)");
                if (! empty($s['unmapped'])) {
                    $this->warn('  unmapped person IDs: '.implode(', ', array_keys($s['unmapped'])));
                }
            } catch (\Throwable $e) {
                $failures++;
                $this->error("  FAILED: {$e->getMessage()}");
            }
        }

        return $failures > 0 ? self::FAILURE : self::SUCCESS;
    }
}
