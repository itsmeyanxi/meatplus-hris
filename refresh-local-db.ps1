# Refresh the local Laragon Postgres (meatplus_hris) from Supabase.
#
# Run this right BEFORE switching the server over to the office PC, so the local
# copy captures every punch/leave/etc. made on the live (Render+Supabase) site up
# to that moment. Safe to run repeatedly. Does NOT touch the live site.
#
#   .\refresh-local-db.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pg   = 'C:\laragon\bin\postgresql\pgsql\bin'

function Get-EnvVal($file, $key) {
    if (-not (Test-Path $file)) { return '' }
    $m = Select-String -Path $file -Pattern "^$key=(.*)$" | Select-Object -First 1
    if (-not $m) { return '' }
    return $m.Matches[0].Groups[1].Value.Trim().Trim('"')
}

# Find whichever env file still holds the Supabase credentials (after cut-over,
# .env points at the local DB, so fall back to the backup taken at switch time).
$candidates = @(
    (Join-Path $root 'backend\.env'),
    (Join-Path $root 'backend\.env.dev-supabase.bak')
)
$src = $null
foreach ($f in $candidates) {
    if ((Get-EnvVal $f 'DB_HOST') -like '*supabase*') { $src = $f; break }
}
if (-not $src) { throw "No env file with Supabase DB_HOST found. Cannot refresh from Supabase." }

$supaHost = Get-EnvVal $src 'DB_HOST'
$supaUser = Get-EnvVal $src 'DB_USERNAME'
$supaPw   = Get-EnvVal $src 'DB_PASSWORD'
Write-Host "Source (Supabase creds from): $src"

$dump = Join-Path $env:TEMP 'supa_public.sql'
Write-Host "Dumping Supabase public schema..."
$env:PGPASSWORD = $supaPw
& "$pg\pg_dump.exe" "host=$supaHost port=5432 user=$supaUser dbname=postgres sslmode=require" `
    --schema=public --no-owner --no-privileges --no-comments --quote-all-identifiers -f $dump
Write-Host ("Dump: {0:N1} MB" -f ((Get-Item $dump).Length / 1MB))

# Rebuild the local database from the dump.
$env:PGPASSWORD = Get-EnvVal (Join-Path $root 'backend\.env.production') 'DB_PASSWORD'
if (-not $env:PGPASSWORD) { $env:PGPASSWORD = 'postgres' }
foreach ($r in 'anon', 'authenticated', 'service_role') {
    # Check-then-create so re-runs don't error on "role already exists".
    $exists = & "$pg\psql.exe" "host=127.0.0.1 port=5433 user=postgres dbname=postgres" -w -tAc "SELECT 1 FROM pg_roles WHERE rolname='$r'"
    if (-not $exists) {
        & "$pg\psql.exe" "host=127.0.0.1 port=5433 user=postgres dbname=postgres" -w -c "CREATE ROLE $r" | Out-Null
    }
}
& "$pg\psql.exe" "host=127.0.0.1 port=5433 user=postgres dbname=postgres" -w `
    -c "DROP DATABASE IF EXISTS meatplus_hris;" -c "CREATE DATABASE meatplus_hris;" | Out-Null
Write-Host "Restoring into local meatplus_hris..."
# Restore emits harmless stderr for Supabase-only RLS policies; PS 5.1 would treat
# that native stderr as fatal, so relax error handling just for this call.
$prevEA = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& "$pg\psql.exe" "host=127.0.0.1 port=5433 user=postgres dbname=meatplus_hris" -w -v ON_ERROR_STOP=0 -f $dump *> $null
$ErrorActionPreference = $prevEA
Remove-Item $dump -ErrorAction SilentlyContinue

$emp = & "$pg\psql.exe" "host=127.0.0.1 port=5433 user=postgres dbname=meatplus_hris" -w -tA -c "select count(*) from employees;"
Write-Host "Refresh complete. Local employees = $emp"
