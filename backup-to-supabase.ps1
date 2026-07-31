# Meatplus HRIS - off-site backup to Supabase
#
#   Restores the NEWEST local pg_dump (from .\backups\) into the off-site
#   Supabase Postgres, giving a live, restorable disaster-recovery copy.
#   Runs after the nightly local backup.
#
# Setup (one-time):
#   1. Resume the Supabase project (free tier pauses when idle) at
#      https://supabase.com/dashboard  ->  project wiboezprksjihykpdajf
#   2. Add this line to backend\.env.production (Settings -> Database -> Connection string):
#        SUPABASE_BACKUP_URL="postgresql://postgres.<ref>:<PASSWORD>@<host>:5432/postgres"
#      Use the DIRECT connection (port 5432), not the transaction pooler.
#
# Then test:  .\backup-to-supabase.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# Append a timestamped line to the run log so the scheduled task leaves a trail.
$logFile = Join-Path $root 'backups\supabase-backup.log'
function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Add-Content -Path $logFile -Encoding utf8 }
try { Log 'run started' } catch {}

# --- read the Supabase connection URL from backend\.env.production ---
$envFile = Join-Path $root 'backend\.env.production'
if (-not (Test-Path $envFile)) { throw "Cannot find $envFile" }
$line = Select-String -Path $envFile -Pattern '^\s*SUPABASE_BACKUP_URL\s*=' | Select-Object -First 1
if (-not $line) { throw "SUPABASE_BACKUP_URL is not set in backend\.env.production (see setup notes at top of this script)." }
$url = ($line.Line -replace '^\s*SUPABASE_BACKUP_URL\s*=', '').Trim().Trim('"')
if (-not $url) { throw "SUPABASE_BACKUP_URL is empty." }

# --- newest local dump ---
$dump = Get-ChildItem (Join-Path $root 'backups') -Filter *.dump -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $dump) { throw "No local .dump found in .\backups\ - run .\backup-db.ps1 first." }

$restore = 'C:\laragon\bin\postgresql\pgsql\bin\pg_restore.exe'
if (-not (Test-Path $restore)) { throw "pg_restore not found at $restore" }

Write-Host "Restoring $($dump.Name) into Supabase (off-site) at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# --clean --if-exists so the off-site copy is replaced wholesale each run.
# pg_restore exits non-zero on benign warnings, so we don't treat that as fatal.
& $restore --clean --if-exists --no-owner --no-privileges --schema=public --dbname=$url $dump.FullName
$code = $LASTEXITCODE

if ($code -eq 0) {
    Write-Host 'Off-site backup to Supabase complete.'
    Log "OK  restored $($dump.Name) (exit 0)"
} else {
    # Warnings (e.g. "does not exist, skipping" on first run) are expected.
    Write-Warning "pg_restore finished with exit $code - review output above; warnings on DROP are normal on a first/empty target."
    Log "DONE-WITH-WARNINGS  restored $($dump.Name) (exit $code)"
}
