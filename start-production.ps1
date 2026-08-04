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
# Next.js serves port 80 DIRECTLY (it is the public entry point). Caddy used to
# do this, but Windows Smart App Control blocks the unsigned caddy.exe, so the
# frontend now proxies /api, /sanctum, /up and /iclock to the backend itself
# (see frontend/next.config.mjs). Set back to 3001 if Caddy is ever restored.
$frontendPort = 80

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

# --- Backend (Laravel API) worker POOL -> 127.0.0.1:8000..(8000+N-1) ---
# `php artisan serve` handles ONE request at a time, so a slow request (e.g. a
# biometric DTR recompute) blocks everything on that process. Run a small pool and
# let Caddy load-balance across them (health-checked). To go back to a single
# backend, set $backendWorkers = 1 and restart — Caddy routes to whatever is up.
# --host=0.0.0.0 so the LAN ZKTeco device can still push to <lan-ip>:8000/iclock.
$backendWorkers = 4
for ($w = 0; $w -lt $backendWorkers; $w++) {
    $port = $backendPort + $w
    if (Test-PortInUse -Port $port) {
        Write-Host "Backend worker on $port already running - skipping."
    } else {
        Write-Host "Starting backend worker on $port..."
        Start-Process -FilePath (Join-Path $phpDir 'php.exe') `
            -ArgumentList 'artisan','serve','--host=0.0.0.0',"--port=$port" `
            -WorkingDirectory $backendDir -WindowStyle Minimized `
            -RedirectStandardOutput (Join-Path $logDir "backend-$port.log") `
            -RedirectStandardError  (Join-Path $logDir "backend-$port.err.log")
    }
}

Write-Host -NoNewline 'Waiting for backend'
$ready = $false
foreach ($i in 1..30) {
    try { if ((Invoke-WebRequest "http://127.0.0.1:$backendPort/up" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $ready = $true; break } } catch {}
    Write-Host -NoNewline '.'; Start-Sleep -Seconds 2
}
Write-Host ''; if ($ready) { Write-Host "Backend pool up ($backendWorkers worker(s), ports $backendPort..$($backendPort + $backendWorkers - 1))." } else { Write-Warning "Backend not answering - see $logDir\backend-$backendPort.err.log" }

# --- Queue worker watchdog (keeps the worker alive: invitation/reset emails) ---
# Launches queue-worker-keepalive.ps1 -Watch, which starts the worker and restarts
# it within minutes if it ever dies — so queued mail always sends.
if (Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*queue-worker-keepalive*-Watch*' }) {
    Write-Host "Queue worker watchdog already running - skipping."
} else {
    Write-Host "Starting queue worker watchdog..."
    Start-Process -FilePath 'powershell.exe' -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $root 'queue-worker-keepalive.ps1')`" -Watch"
}

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

# --- Caddy (reverse proxy) — DISABLED ---
# Windows Smart App Control (enforced) blocks the unsigned tools\caddy.exe:
# "An Application Control policy has blocked this file". Next.js serves port 80
# directly instead and proxies /api, /sanctum, /up and /iclock to the backend.
# To restore Caddy: use a SIGNED caddy build (or turn off Smart App Control —
# note that is irreversible without reinstalling Windows), set $frontendPort back
# to 3001, then re-enable the block below.
$useCaddy = $false
if ($useCaddy) {
    $caddyExe = Join-Path $root 'tools\caddy.exe'
    if (-not (Test-Path $caddyExe)) {
        $onPath = Get-Command caddy.exe -ErrorAction SilentlyContinue
        $caddyExe = if ($onPath) { $onPath.Source } else { $null }
    }
    if ($caddyExe -and (Test-Path $caddyExe)) {
        Write-Host "Starting Caddy from $caddyExe ..."
        Start-Process -FilePath $caddyExe -ArgumentList 'run','--config','Caddyfile' `
            -WorkingDirectory $root -WindowStyle Minimized `
            -RedirectStandardOutput (Join-Path $logDir 'caddy.log') `
            -RedirectStandardError  (Join-Path $logDir 'caddy.err.log')
    } else {
        Write-Warning "caddy.exe not found (expected in tools\ or on PATH)."
    }
} else {
    Write-Host "Caddy disabled (blocked by Smart App Control) - Next.js is serving port 80."
}

Write-Host ''
Write-Host "Meatplus HRIS (production) started."
Write-Host "Local check: http://localhost:$frontendPort   Public (after DNS): https://allcompanyhris.meatplus.ph"
Write-Host "Logs: $logDir"
