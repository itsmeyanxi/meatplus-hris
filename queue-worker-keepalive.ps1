# Ensures the Laravel queue worker is running; starts it if not.
#
# Queued jobs (invitation / password-reset emails) only send while a
# `php artisan queue:work` process is alive. Run with -Watch to loop forever and
# (re)start the worker within minutes of any crash — so queued mail always sends.
#
#   .\queue-worker-keepalive.ps1          # one-shot check
#   .\queue-worker-keepalive.ps1 -Watch   # keep checking every 5 min (run detached)
param([switch]$Watch)
$ErrorActionPreference = 'SilentlyContinue'

$backend = 'C:\Users\ALL COMPANY HRIS\Documents\meatplus-hris\backend'
$phpDir  = (Get-ChildItem 'C:\laragon\bin\php' -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
$php     = Join-Path $phpDir 'php.exe'

function Ensure-Worker {
    $running = Get-CimInstance Win32_Process -Filter "Name='php.exe'" |
        Where-Object { $_.CommandLine -match 'queue:work' }
    if (-not $running) {
        # --max-time recycles the worker hourly (frees memory, picks up code
        # changes); this keep-alive restarts it. --tries=3 retries a failing email.
        Start-Process -FilePath $php `
            -ArgumentList 'artisan','queue:work','--tries=3','--sleep=3','--max-time=3600' `
            -WorkingDirectory $backend -WindowStyle Hidden
        Write-Output "$(Get-Date -Format s)  queue worker started"
    }
}

if ($Watch) {
    while ($true) { Ensure-Worker; Start-Sleep -Seconds 300 }
} else {
    Ensure-Worker
}
