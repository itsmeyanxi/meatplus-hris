# Roll back the multi-worker backend pool to the original single-backend setup
# (one `php artisan serve`, frontend proxies /api). Run this if the pool ever
# causes trouble — it's the "easy way back".
#
#   .\revert-to-single-backend.ps1
#
# Note: you don't strictly need this just to reduce load — because Caddy health-
# checks the workers, simply stopping the extra ones leaves the pool routing to
# whatever's alive. This script does the FULL revert (restores the old Caddyfile
# so /api goes back through the frontend) for when you want the exact prior state.

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot

# 1) Stop the extra workers (8001-8003); keep the primary on 8000.
foreach ($port in 8001, 8002, 8003) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host "stopped backend worker on $port" }
}

# 2) Restore the single-backend Caddyfile (frontend proxies /api) + reload Caddy.
$bak = Join-Path $root 'Caddyfile.single-backend.bak'
if (Test-Path $bak) {
    Copy-Item $bak (Join-Path $root 'Caddyfile') -Force
    $caddy = Join-Path $root 'tools\caddy.exe'
    if (Test-Path $caddy) { & $caddy reload --config (Join-Path $root 'Caddyfile') 2>$null; Write-Host "restored single-backend Caddyfile and reloaded Caddy." }
} else {
    Write-Warning "Caddyfile.single-backend.bak not found - Caddyfile left as-is (pool routing)."
}

# 3) Set future restarts to a single worker.
$sp = Join-Path $root 'start-production.ps1'
if (Test-Path $sp) {
    (Get-Content $sp) -replace '\$backendWorkers = \d+', '$backendWorkers = 1' | Set-Content $sp
    Write-Host "start-production.ps1: backendWorkers set to 1."
}

Write-Host ""
Write-Host "Reverted to the single-backend setup." -ForegroundColor Green
