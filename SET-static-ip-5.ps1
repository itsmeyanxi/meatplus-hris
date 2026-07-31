# ============================================================
#  Set this machine to STATIC 192.168.125.5 (for the proxy).
#  Run this in an ELEVATED PowerShell (Run as administrator).
#  It auto-reverts to DHCP if the gateway becomes unreachable.
# ============================================================
$if = "Ethernet"
Write-Host "Setting static 192.168.125.5 on $if ..."
netsh interface ip set address name="$if" static 192.168.125.5 255.255.255.0 192.168.125.1
netsh interface ip set dns name="$if" static 192.168.125.1
Start-Sleep 5
$gw = Test-Connection 192.168.125.1 -Count 2 -Quiet -ErrorAction SilentlyContinue
if (-not $gw) {
    Write-Host "!! Gateway unreachable - reverting to DHCP..." -ForegroundColor Red
    netsh interface ip set address name="$if" source=dhcp
    netsh interface ip set dns name="$if" source=dhcp
    ipconfig /renew | Out-Null
} else {
    Write-Host "OK - static 192.168.125.5 applied." -ForegroundColor Green
    Write-Host ("  internet: {0}" -f (Test-Connection 8.8.8.8 -Count 2 -Quiet -ErrorAction SilentlyContinue))
}
Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias $if | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object IPAddress, PrefixOrigin
Write-Host "`nDone. Test the site: http://allcompanyhris.meatplus.ph/dashboard"
Write-Host "To undo: run REVERT-network-to-DHCP.ps1 (same folder), also as administrator."
Read-Host "`nPress Enter to close"
