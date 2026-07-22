# Meatplus HRIS - daily attendance close-out
#
#   Recomputes the last few days of DTRs so completed workdays with no punch
#   (and no leave / holiday / COA / OB) are marked ABSENT. Only processes up to
#   yesterday; contractual / no-schedule staff are never marked absent.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$phpDir = Get-ChildItem 'C:\laragon\bin\php' -Directory | Sort-Object Name -Descending | Select-Object -First 1
$php = Join-Path $phpDir.FullName 'php.exe'
if (-not (Test-Path $php)) { throw "php.exe not found under C:\laragon\bin\php" }

Write-Host "Closing out attendance at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
& $php (Join-Path $root 'backend\artisan') attendance:sync-dtr --days=3
if ($LASTEXITCODE -ne 0) { throw "attendance:sync-dtr failed (exit $LASTEXITCODE)" }
Write-Host 'Done.'
