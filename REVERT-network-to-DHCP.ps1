# Revert this machine's network back to automatic (DHCP).
netsh interface ip set address name="Ethernet" source=dhcp
netsh interface ip set dns name="Ethernet" source=dhcp
ipconfig /renew
Write-Host "Reverted to DHCP. Current IP:"
Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet" | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object IPAddress, PrefixOrigin
