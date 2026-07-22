# Meatplus HRIS - background queue worker
#
#   Processes queued jobs (invitation emails, etc.) so web requests return
#   immediately instead of waiting on slow SMTP. Runs continuously; queue:work
#   exits every hour (--max-time) or on failure, and this loop relaunches it.

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot

$phpDir = Get-ChildItem 'C:\laragon\bin\php' -Directory | Sort-Object Name -Descending | Select-Object -First 1
$php = Join-Path $phpDir.FullName 'php.exe'
$artisan = Join-Path $root 'backend\artisan'

while ($true) {
    & $php $artisan queue:work --sleep=3 --tries=3 --timeout=120 --max-time=3600
    Start-Sleep -Seconds 5
}
