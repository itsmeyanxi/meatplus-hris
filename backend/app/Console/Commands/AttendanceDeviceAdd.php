<?php

namespace App\Console\Commands;

use App\Domain\Attendance\Models\AttendanceDevice;
use App\Domain\Attendance\Services\Biometric\HikvisionIsapiClient;
use App\Domain\Identity\Models\Company;
use Illuminate\Console\Command;

class AttendanceDeviceAdd extends Command
{
    protected $signature = 'attendance:device-add
        {--name= : Friendly name (e.g. "Main Entrance")}
        {--ip= : Device IP address}
        {--port=80 : ISAPI HTTP port}
        {--user= : Device admin username}
        {--password= : Device admin password}
        {--company= : Company code (defaults to the first company)}
        {--no-verify : Skip the connectivity check}';

    protected $description = 'Register a biometric attendance terminal (credentials stored encrypted).';

    public function handle(): int
    {
        $name = $this->option('name') ?: $this->ask('Device name');
        $ip = $this->option('ip') ?: $this->ask('Device IP address');
        $port = (int) ($this->option('port') ?: 80);
        $user = $this->option('user') ?: $this->ask('Admin username');
        $password = $this->option('password') ?: $this->secret('Admin password');

        $company = $this->option('company')
            ? Company::where('code', $this->option('company'))->first()
            : Company::query()->orderBy('id')->first();

        if (! $company) {
            $this->error('No company found. Seed companies first.');

            return self::FAILURE;
        }

        $device = new AttendanceDevice([
            'company_id' => $company->id,
            'name' => $name,
            'ip_address' => $ip,
            'port' => $port,
            'username' => $user,
            'password' => $password,
            'is_active' => true,
        ]);

        if (! $this->option('no-verify')) {
            $this->info("Connecting to {$device->baseUrl()} …");
            try {
                $info = (new HikvisionIsapiClient($device))->deviceInfo();
                $device->serial_no = $info['serial'] ?? null;
                $this->line("  Model:    {$info['model']}");
                $this->line("  Serial:   {$info['serial']}");
                $this->line("  Firmware: {$info['firmware']}");
            } catch (\Throwable $e) {
                $this->error('Connection failed: '.$e->getMessage());
                $this->warn('Use --no-verify to register anyway.');

                return self::FAILURE;
            }
        }

        $device->save();

        $this->info("Registered device #{$device->id} ({$device->name}) for {$company->code}.");
        $this->line('Run a sync with:  php artisan attendance:sync-biometric --device='.$device->id);

        return self::SUCCESS;
    }
}
