# Rebuild + redeploy the Next.js frontend with a MAINTENANCE PAGE instead of a
# dead port during the build.
#
# Why this exists: Next.js serves port 80 directly (no reverse proxy — Caddy is
# blocked by Smart App Control). On Windows we must stop `next start` before
# `next build` (it locks .next), which leaves port 80 dead for the whole build —
# visitors get ERR_CONNECTION_REFUSED. This script keeps port 80 answering with a
# friendly "Under Maintenance" page the whole time, then hands it back to Next.
#
# Flow:  stop Next -> serve maintenance on :80 -> build -> stop maintenance -> start Next
#
# Usage:  .\deploy-frontend.ps1            (build + deploy)
#         .\deploy-frontend.ps1 -SkipBuild (just restart under maintenance, e.g. after a failed build)

param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'

$root       = $PSScriptRoot
$frontendDir = Join-Path $root 'frontend'
$logDir     = Join-Path $root 'logs'
$maintServer = Join-Path $root 'tools\maintenance-server.js'
$port       = 80

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$nodeDir = (Get-ChildItem 'C:\laragon\bin\nodejs' -Directory |
    Where-Object { $_.Name -like 'node-*' } | Sort-Object Name -Descending | Select-Object -First 1).FullName
$node = Join-Path $nodeDir 'node.exe'
$npm  = Join-Path $nodeDir 'npm.cmd'
$env:PATH = "$nodeDir;$env:PATH"

function Stop-Port80 {
    $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($conns) {
        $conns.OwningProcess | Select-Object -Unique | ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 600
    }
}

# 1. Free port 80 (stop Next) and bring up the maintenance page.
Write-Host "Stopping frontend on :$port ..."
Stop-Port80
Write-Host "Starting maintenance page on :$port ..."
$maint = Start-Process -FilePath $node -ArgumentList "`"$maintServer`"" `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logDir 'maintenance.log') `
    -RedirectStandardError  (Join-Path $logDir 'maintenance.err.log')
Start-Sleep -Seconds 1
if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
    Write-Host "Maintenance page is live (pid $($maint.Id))."
} else {
    Write-Warning "Maintenance page did not bind :$port - see logs\maintenance.err.log"
}

# 2. Build the new frontend while the maintenance page holds the fort.
if (-not $SkipBuild) {
    Write-Host "Building frontend (this is when users see the maintenance page)..."
    Push-Location $frontendDir
    & $npm run build
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) {
        Write-Warning "Build FAILED (exit $code). Leaving the maintenance page up so the old build isn't half-served."
        Write-Warning "Fix the build, then re-run this script."
        exit $code
    }
    Write-Host "Build OK."
}

# 3. Swap: stop maintenance, start Next on :80.
Write-Host "Stopping maintenance page and starting the new frontend..."
if ($maint -and -not $maint.HasExited) { Stop-Process -Id $maint.Id -Force -ErrorAction SilentlyContinue }
Stop-Port80

Start-Process -FilePath $npm -ArgumentList 'run','start','--','-p',"$port",'-H','0.0.0.0' `
    -WorkingDirectory $frontendDir -WindowStyle Minimized `
    -RedirectStandardOutput (Join-Path $logDir 'frontend.log') `
    -RedirectStandardError  (Join-Path $logDir 'frontend.err.log')

# 4. Wait for it to answer.
Write-Host -NoNewline "Waiting for frontend"
$ready = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 2
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { $ready = $true; break }
    Write-Host -NoNewline '.'
}
Write-Host ''
if ($ready) {
    Write-Host "Frontend is back up on http://localhost:$port"
} else {
    Write-Warning "Frontend did not come up - check logs\frontend.err.log"
}
