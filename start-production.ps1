# Meatplus HRIS - PRODUCTION start script (self-hosted, no Render).
#
# Difference from start-servers.ps1 (dev):
#   - Backend runs with the PRODUCTION env (.env.production -> .env), config cached.
#   - Frontend runs the compiled build (`next start`), NOT `next dev`.
#   - Optionally launches Caddy (reverse proxy + HTTPS) if caddy.exe is on PATH.
#
# One-time before first run:
#   cd frontend; npm ci; npm run build      (compile the production frontend)
#   Stop Laragon Apache so Caddy can take 80/443.
#
# Register at logon with:  .\register-autostart.ps1  (point it at THIS script)

$ErrorActionPreference = 'Stop'

$root        = $PSScriptRoot
$backendDir  = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$logDir      = Join-Path $root 'logs'
$backendPort  = 8000
$frontendPort = 3001

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Find-LaragonDir {
    param($Parent, $Pattern)
    $dir = Get-ChildItem -Path $Parent -Directory |
        Where-Object { $_.Name -like $Pattern } | Sort-Object Name -Descending | Select-Object -First 1
    if ($null -eq $dir) { throw "No directory matching '$Pattern' under $Parent" }
    return $dir.FullName
}
function Test-PortInUse { param([int]$Port)
    return ($null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue))
}

$phpDir  = Find-LaragonDir -Parent 'C:\laragon\bin\php'    -Pattern 'php-*'
$nodeDir = Find-LaragonDir -Parent 'C:\laragon\bin\nodejs' -Pattern 'node-*'
$env:PATH = "$phpDir;$nodeDir;$env:PATH"

# --- Ensure the local database (Laragon PostgreSQL 17) is up on 5433 ---
# Laragon's Postgres is NOT a Windows service, so a reboot/power outage leaves it
# down. Start it here (in this interactive logon session) so the whole stack
# recovers. A separate PostgreSQL-18 service owns 5432; ours must be 5433.
if (-not (Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue)) {
    Write-Host "Local Postgres (5433) is down - starting it..."
    $pgctl  = 'C:\laragon\bin\postgresql\pgsql\bin\pg_ctl.exe'
    $pgdata = 'C:\laragon\data\postgresql-17'
    $pidf   = Join-Path $pgdata 'postmaster.pid'
    if (Test-Path $pidf) { cmd /c "del /f /q `"$pidf`"" | Out-Null }  # clear stale pid from crash
    Start-Process -FilePath $pgctl -ArgumentList 'start','-D',"`"$pgdata`"",'-o','"-p 5433"','-l',"`"$pgdata\startup.log`""
    foreach ($i in 1..30) { if (Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue) { break }; Start-Sleep 2 }
    if (Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue) { Write-Host "Postgres 5433 is up." } else { Write-Warning "Postgres 5433 did not start - check $pgdata\startup.log" }
} else {
    Write-Host "Local Postgres (5433) already running."
}

# --- Activate production env (one-time backup of the current .env) ---
$envFile  = Join-Path $backendDir '.env'
$envProd  = Join-Path $backendDir '.env.production'
$envBak   = Join-Path $backendDir '.env.dev-supabase.bak'
if (-not (Test-Path $envProd)) { throw ".env.production not found - create it first." }
if (-not (Test-Path $envBak) -and (Test-Path $envFile)) {
    Copy-Item $envFile $envBak
    Write-Host "Backed up current .env -> .env.dev-supabase.bak"
}
Copy-Item $envProd $envFile -Force
Write-Host "Activated production env (.env.production -> .env)"

# --- Cache config/routes for production performance ---
Push-Location $backendDir
& (Join-Path $phpDir 'php.exe') artisan config:cache | Out-Null
& (Join-Path $phpDir 'php.exe') artisan route:cache  | Out-Null
Pop-Location
Write-Host "Cached config + routes."

# --- Backend (Laravel API) -> 127.0.0.1:8000 ---
# --host=0.0.0.0 so the LAN ZKTeco device can still push to <lan-ip>:8000/iclock.
if (Test-PortInUse -Port $backendPort) {
    Write-Host "Backend already on port $backendPort - skipping."
} else {
    Write-Host "Starting backend (production) on $backendPort..."
    Start-Process -FilePath (Join-Path $phpDir 'php.exe') `
        -ArgumentList 'artisan','serve','--host=0.0.0.0',"--port=$backendPort" `
        -WorkingDirectory $backendDir -WindowStyle Minimized `
        -RedirectStandardOutput (Join-Path $logDir 'backend.log') `
        -RedirectStandardError  (Join-Path $logDir 'backend.err.log')
}

Write-Host -NoNewline 'Waiting for backend'
$ready = $false
foreach ($i in 1..30) {
    try { if ((Invoke-WebRequest "http://127.0.0.1:$backendPort/up" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $ready = $true; break } } catch {}
    Write-Host -NoNewline '.'; Start-Sleep -Seconds 2
}
Write-Host ''; if ($ready) { Write-Host 'Backend is up.' } else { Write-Warning "Backend not answering - see $logDir\backend.err.log" }

# --- Frontend (Next.js compiled build) -> 127.0.0.1:3001 ---
if (-not (Test-Path (Join-Path $frontendDir '.next'))) {
    throw "No frontend build found (.next). Run: cd frontend; npm run build"
}
if (Test-PortInUse -Port $frontendPort) {
    Write-Host "Frontend already on port $frontendPort - skipping."
} else {
    Write-Host "Starting frontend (production) on $frontendPort..."
    Start-Process -FilePath (Join-Path $nodeDir 'npm.cmd') `
        -ArgumentList 'run','start','--','-p',"$frontendPort",'-H','0.0.0.0' `
        -WorkingDirectory $frontendDir -WindowStyle Minimized `
        -RedirectStandardOutput (Join-Path $logDir 'frontend.log') `
        -RedirectStandardError  (Join-Path $logDir 'frontend.err.log')
}

# --- Caddy (reverse proxy + HTTPS) ---
# Prefer the bundled copy in tools\, fall back to one on PATH.
$caddyExe = Join-Path $root 'tools\caddy.exe'
if (-not (Test-Path $caddyExe)) {
    $onPath = Get-Command caddy.exe -ErrorAction SilentlyContinue
    $caddyExe = if ($onPath) { $onPath.Source } else { $null }
}
if ($caddyExe -and (Test-Path $caddyExe)) {
    if (Test-PortInUse -Port 443) {
        Write-Warning "Port 443 already in use (Laragon Apache?). Stop it before Caddy can bind."
    } else {
        Write-Host "Starting Caddy (80/443) from $caddyExe ..."
        Start-Process -FilePath $caddyExe -ArgumentList 'run','--config','Caddyfile' `
            -WorkingDirectory $root -WindowStyle Minimized `
            -RedirectStandardOutput (Join-Path $logDir 'caddy.log') `
            -RedirectStandardError  (Join-Path $logDir 'caddy.err.log')
    }
} else {
    Write-Warning "caddy.exe not found (expected in tools\ or on PATH) - HTTPS/reverse-proxy will not start."
}

Write-Host ''
Write-Host "Meatplus HRIS (production) started."
Write-Host "Local check: http://localhost:$frontendPort   Public (after DNS): https://allcompanyhris.meatplus.ph"
Write-Host "Logs: $logDir"
