# Register Laragon's PostgreSQL 17 (our meatplus_hris DB, port 5433) as an
# auto-starting Windows service, so it survives reboots / power outages WITHOUT
# anyone logging in — the same way the separate PostgreSQL-18 service does.
#
# RUN THIS ONCE, AS ADMINISTRATOR:
#   Right-click Start -> Terminal (Admin)  [or PowerShell (Admin)]
#   cd "C:\Users\ALL COMPANY HRIS\Documents\meatplus-hris"
#   powershell -ExecutionPolicy Bypass -File .\register-postgres-service.ps1
#
# It briefly stops the DB (~10s) to hand port 5433 to the service, then starts it.
# Safe to re-run.

$ErrorActionPreference = 'Stop'

# --- must be elevated ---
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    Write-Error "This must be run as Administrator. Open an elevated PowerShell and run it again."
    exit 1
}

$pgctl  = 'C:\laragon\bin\postgresql\pgsql\bin\pg_ctl.exe'
$pgdata = 'C:\laragon\data\postgresql-17'
$svc    = 'meatplus-postgres17'

if (-not (Test-Path $pgctl))  { Write-Error "pg_ctl not found at $pgctl"; exit 1 }
if (-not (Test-Path $pgdata)) { Write-Error "data dir not found at $pgdata"; exit 1 }

# 1) Stop the currently-running (manually started) instance so the service can bind 5433.
if (Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue) {
    Write-Host "Stopping the current Postgres on 5433 (brief downtime)..."
    try { & $pgctl stop -D $pgdata -m fast -w -t 30 } catch { Write-Warning "pg_ctl stop said: $_" }
    Start-Sleep 3
    $pidf = Join-Path $pgdata 'postmaster.pid'
    if (Test-Path $pidf) { cmd /c "del /f /q `"$pidf`"" | Out-Null }
}

# 2) Register the service (auto-start), pinned to port 5433.
$existing = Get-Service $svc -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Host "Registering service '$svc' (auto-start, port 5433)..."
    & $pgctl register -N $svc -D $pgdata -o "-p 5433" -S auto
    Start-Sleep 2
} else {
    Write-Host "Service '$svc' already exists."
}

# 3) Start it.
Write-Host "Starting service..."
Start-Service $svc
Start-Sleep 5

# 4) Verify.
$ok = $false
foreach ($i in 1..15) {
    if (Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue) { $ok = $true; break }
    Start-Sleep 2
}
if ($ok) {
    Write-Host ""
    Write-Host "SUCCESS: PostgreSQL is now a Windows service on port 5433." -ForegroundColor Green
    Write-Host "It will auto-start on every boot (StartType: $((Get-Service $svc).StartType)) - no login needed."
    Write-Host "Verify anytime with:  Get-Service $svc"
} else {
    Write-Warning "Service registered but 5433 is not listening. Check the Windows Event Log and $pgdata\log."
    Write-Warning "If it's a permissions issue, re-register with a specific account:"
    Write-Warning "  $pgctl unregister -N $svc"
    Write-Warning "  $pgctl register -N $svc -D `"$pgdata`" -o `"-p 5433`" -S auto -U <YourWindowsAccount> -P <password>"
}
