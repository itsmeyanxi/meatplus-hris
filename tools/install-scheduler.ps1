# Registers the Laravel scheduler as a per-minute Windows task.
#
# Mirrors tools\install-frontend-watchdog.ps1: Register-ScheduledTask (NOT schtasks —
# the spaced "ALL COMPANY HRIS" path breaks schtasks /TR), launched via wscript so no
# console window flashes every minute.
#
# Run once, from an elevated-or-not PowerShell (Limited run level is enough):
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\install-scheduler.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$vbs  = Join-Path $root 'tools\run-scheduler-hidden.vbs'
if (-not (Test-Path $vbs)) { throw "Missing $vbs" }

$taskName = 'Meatplus HRIS Scheduler'

$action  = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date)
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition

# IgnoreNew: a slow tick must never stack up behind itself. The 10-minute limit is a
# backstop — individual jobs already use withoutOverlapping().
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Registered scheduled task: '$taskName' (every 1 minute)."
Write-Host "It runs 'php artisan schedule:run', which drives everything in routes/console.php:"
Write-Host "  - attendance:sync-biometric              every 5 minutes"
Write-Host "  - attendance:reclaim-unmatched           every 15 minutes"
Write-Host "  - attendance:detect-biometric-anomalies  hourly"
Write-Host "  - employees:detect-data-issues           hourly"
Write-Host "Logs: logs\schedule.log (quiet minutes are not logged)"
