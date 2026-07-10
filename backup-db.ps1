# Meatplus HRIS - database backup
#
#   .\backup-db.ps1              back up whichever database backend/.env points at
#   .\backup-db.ps1 -KeepDays 30 prune dumps older than 30 days (default 14)
#
# Dumps land in .\backups\ , which is gitignored: they contain employee PII.

param([int]$KeepDays = 14)

$ErrorActionPreference = 'Stop'

$root    = $PSScriptRoot
$envFile = Join-Path $root 'backend\.env'
$outDir  = Join-Path $root 'backups'

if (-not (Test-Path $envFile)) { throw "Cannot find $envFile" }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Read the ACTIVE (uncommented) DB_* lines, so this follows .env rather than
# assuming a backend.
function Get-EnvValue {
    param([string]$Key)
    $line = Select-String -Path $envFile -Pattern "^\s*$Key\s*=" | Select-Object -First 1
    if (-not $line) { return '' }
    return ($line.Line -replace "^\s*$Key\s*=", '').Trim().Trim('"')
}

$conn = Get-EnvValue 'DB_CONNECTION'
$dbHost = Get-EnvValue 'DB_HOST'
$port = Get-EnvValue 'DB_PORT'
$name = Get-EnvValue 'DB_DATABASE'
$user = Get-EnvValue 'DB_USERNAME'
$pass = Get-EnvValue 'DB_PASSWORD'

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Write-Host "Backing up $conn database '$name' on ${dbHost}:${port}"

if ($conn -eq 'mysql') {
    $exe = Get-ChildItem 'C:\laragon\bin\mysql' -Directory |
        Sort-Object Name -Descending | Select-Object -First 1
    $dump = Join-Path $exe.FullName 'bin\mysqldump.exe'
    if (-not (Test-Path $dump)) { throw "mysqldump not found at $dump" }

    $out = Join-Path $outDir "$name-$stamp.sql"
    $args = @('-u', $user, '--protocol=tcp', '-h', $dbHost, '-P', $port,
              '--single-transaction', '--routines', '--triggers', '--events',
              '--default-character-set=utf8mb4', $name)
    if ($pass) { $args = @("-p$pass") + $args }

    & $dump @args | Out-File -FilePath $out -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "mysqldump failed (exit $LASTEXITCODE)" }
}
elseif ($conn -eq 'pgsql') {
    $dump = 'C:\laragon\bin\postgresql\pgsql\bin\pg_dump.exe'
    if (-not (Test-Path $dump)) { throw "pg_dump not found at $dump" }

    $out = Join-Path $outDir "$name-$stamp.dump"
    $env:PGPASSWORD = $pass
    $sslmode = Get-EnvValue 'DB_SSLMODE'
    if ($sslmode) { $env:PGSSLMODE = $sslmode }

    & $dump -h $dbHost -p $port -U $user -d $name `
        --schema=public --no-owner --no-privileges -Fc -f $out
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }

    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
else {
    throw "Unsupported DB_CONNECTION '$conn'"
}

$size = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "Wrote $out ($size KB)"

# A backup you never restore is a rumour. Fail loudly on an empty dump.
if ((Get-Item $out).Length -lt 10KB) { throw "Dump looks too small - check it." }

$cutoff = (Get-Date).AddDays(-$KeepDays)
$old = Get-ChildItem $outDir -File | Where-Object { $_.LastWriteTime -lt $cutoff }
if ($old) {
    $old | Remove-Item -Force
    Write-Host "Pruned $($old.Count) backup(s) older than $KeepDays days."
}

Write-Host 'Done.'
