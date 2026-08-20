# Laravel scheduler tick â€” runs `php artisan schedule:run` once.
#
# Laravel's whole schedule (routes/console.php) depends on this being called every
# minute; artisan itself decides which jobs are actually due. Without it, NOTHING
# in routes/console.php ever fires â€” which is exactly what happened here: the
# biometric-anomaly and employee-data-issue detectors, and the unmatched-punch
# reclaimer, sat idle from 2026-08-13 to 2026-08-19 because no task called this.
# Attendance still arrived only because the terminals PUSH to /iclock.
#
# Register (once):  see tools\install-scheduler.ps1
# Manual run:       powershell -NoProfile -ExecutionPolicy Bypass -File tools\schedule-runner.ps1
#
# Keep it quiet and non-throwing: a failed tick must never leave a stuck task, and
# it must not spam the log â€” only real output and failures are recorded.

$ErrorActionPreference = 'SilentlyContinue'

$root    = Split-Path $PSScriptRoot -Parent
$artisan = Join-Path $root 'backend\artisan'
$logDir  = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'schedule.log'

function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Add-Content -Path $logFile -Encoding utf8 }

# Newest Laragon PHP, same discovery the other scripts use.
$phpDir = Get-ChildItem 'C:\laragon\bin\php' -Directory |
    Where-Object { $_.Name -like 'php-*' } | Sort-Object Name -Descending | Select-Object -First 1
if (-not $phpDir) { Log 'php.exe not found under C:\laragon\bin\php â€” tick skipped.'; exit 1 }
$php = Join-Path $phpDir.FullName 'php.exe'

# Trim the log so a per-minute task can't grow it without bound (~2000 lines kept).
if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 512KB)) {
    $keep = Get-Content $logFile -Tail 2000
    Set-Content -Path $logFile -Value $keep -Encoding utf8
}

$out = & $php $artisan schedule:run 2>&1
$code = $LASTEXITCODE

# artisan prints "No scheduled commands are ready to run." most minutes â€” that is
# the normal case and is deliberately NOT logged.
$skip = @(
    'No scheduled commands are ready to run',
    'Running \[',
    'DONE\s*$',
    'start /b cmd',
    'schedule:finish'
)
$noise = $out | Where-Object {
    $line = "$_"
    if ([string]::IsNullOrWhiteSpace($line)) { return $false }
    foreach ($pat in $skip) { if ($line -match $pat) { return $false } }
    if ($line -match '^\s*\|') { return $false }
    return $true
}

if ($code -ne 0) {
    Log "schedule:run exited $code"
    if ($noise) { $noise | ForEach-Object { Log "  $_" } }
} elseif ($noise) {
    $noise | ForEach-Object { Log $_ }
}
