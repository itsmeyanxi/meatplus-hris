# Meatplus HRIS - all-company data archive (portable Excel/ZIP)
#
#   Runs `php artisan archive:all-companies`, which writes a dated ZIP of every
#   company's data (Excel, one file per category) to .\backups\archives\ .
#   Scheduled to run every ~15 days; complements the daily pg_dump backup.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$phpDir = Get-ChildItem 'C:\laragon\bin\php' -Directory | Sort-Object Name -Descending | Select-Object -First 1
$php = Join-Path $phpDir.FullName 'php.exe'
if (-not (Test-Path $php)) { throw "php.exe not found under C:\laragon\bin\php" }

Write-Host "Archiving all companies at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
& $php (Join-Path $root 'backend\artisan') archive:all-companies
if ($LASTEXITCODE -ne 0) { throw "archive command failed (exit $LASTEXITCODE)" }
Write-Host 'Done.'
