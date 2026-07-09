# Meatplus HRIS - Auto-start script
# Launches the Laravel backend and the Next.js frontend.
#
# Paths are derived from this script's own location, so the project folder can
# be moved or cloned to another machine without editing anything here.
#
# Register it to run at logon with:  .\register-autostart.ps1

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
    if (-not (Test-Path $Parent)) { throw "Laragon directory not found: $Parent" }
    $dir = Get-ChildItem -Path $Parent -Directory |
        Where-Object { $_.Name -like $Pattern } |
        Sort-Object Name -Descending |
        Select-Object -First 1
    if ($null -eq $dir) { throw "No directory matching '$Pattern' under $Parent" }
    return $dir.FullName
}

function Test-PortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

# Laragon ships several PHP/Node builds; pick the newest rather than hardcoding
# a version, so a Laragon upgrade doesn't silently break startup.
$phpDir  = Find-LaragonDir -Parent 'C:\laragon\bin\php'    -Pattern 'php-*'
$nodeDir = Find-LaragonDir -Parent 'C:\laragon\bin\nodejs' -Pattern 'node-*'
$env:PATH = "$phpDir;$nodeDir;$env:PATH"

# --- Backend (Laravel API) -> http://localhost:8000 ---
# --host=0.0.0.0 keeps it reachable from the LAN so the ZKTeco device can push
# attendance to http://<this-pc-ip>:8000/iclock/cdata
if (Test-PortInUse -Port $backendPort) {
    Write-Host "Backend already running on port $backendPort - skipping."
} else {
    Write-Host "Starting backend on port $backendPort..."
    Start-Process -FilePath (Join-Path $phpDir 'php.exe') `
        -ArgumentList 'artisan', 'serve', "--host=0.0.0.0", "--port=$backendPort" `
        -WorkingDirectory $backendDir `
        -WindowStyle Minimized `
        -RedirectStandardOutput (Join-Path $logDir 'backend.log') `
        -RedirectStandardError  (Join-Path $logDir 'backend.err.log')
}

# The frontend proxies /api to the backend, so wait for the backend to answer
# before starting it. Poll rather than sleeping a fixed guess.
Write-Host -NoNewline 'Waiting for backend'
$ready = $false
foreach ($i in 1..30) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$backendPort/up" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 2
}
Write-Host ''
if ($ready) {
    Write-Host 'Backend is up.'
} else {
    Write-Warning "Backend did not answer on port $backendPort. Check $logDir\backend.err.log"
}

# --- Frontend (Next.js) -> http://localhost:3001 ---
# Port 3001 is required: only :3001 origins are listed in SANCTUM_STATEFUL_DOMAINS,
# so logging in through any other port fails CSRF validation.
if (Test-PortInUse -Port $frontendPort) {
    Write-Host "Frontend already running on port $frontendPort - skipping."
} else {
    Write-Host "Starting frontend on port $frontendPort..."
    Start-Process -FilePath (Join-Path $nodeDir 'npm.cmd') `
        -ArgumentList 'run', 'dev', '--', '-p', "$frontendPort", '-H', '0.0.0.0' `
        -WorkingDirectory $frontendDir `
        -WindowStyle Minimized `
        -RedirectStandardOutput (Join-Path $logDir 'frontend.log') `
        -RedirectStandardError  (Join-Path $logDir 'frontend.err.log')
}

Write-Host ''
Write-Host "Meatplus HRIS starting. Open http://localhost:$frontendPort"
Write-Host "Logs: $logDir"
