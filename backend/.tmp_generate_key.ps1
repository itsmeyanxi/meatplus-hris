$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$key = 'base64:' + [Convert]::ToBase64String($bytes)
Set-Content -Path (Join-Path $PSScriptRoot '.tmp_key.txt') -Value $key
