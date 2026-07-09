# Registers (or removes) a scheduled task that runs start-servers.ps1 at logon.
#
#   Register:  powershell -ExecutionPolicy Bypass -File .\register-autostart.ps1
#   Remove:    powershell -ExecutionPolicy Bypass -File .\register-autostart.ps1 -Remove
#
# The task runs as the current user at RunLevel Limited, which does not require
# administrator rights to register.

param([switch]$Remove)

$ErrorActionPreference = 'Stop'

$taskName   = 'Meatplus HRIS Autostart'
$scriptPath = Join-Path $PSScriptRoot 'start-servers.ps1'

if ($Remove) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "Removed scheduled task '$taskName'."
    } else {
        Write-Host "No scheduled task named '$taskName' - nothing to remove."
    }
    return
}

if (-not (Test-Path $scriptPath)) { throw "Cannot find $scriptPath" }

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" `
    -WorkingDirectory $PSScriptRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Delay a little so networking and Laragon's services are ready before Laravel
# tries to reach Supabase over the internet.
$trigger.Delay = 'PT30S'

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Starts the Meatplus HRIS Laravel backend and Next.js frontend at logon.' `
    -Force | Out-Null

Write-Host "Registered scheduled task '$taskName'."
Write-Host "It runs at logon for user $env:USERNAME, 30s after sign-in."
Write-Host ''
Write-Host "Test it now with:  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Remove it with:    .\register-autostart.ps1 -Remove"
