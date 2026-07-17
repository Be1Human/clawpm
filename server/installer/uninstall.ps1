# clawpm uninstaller. Removes shortcuts, uninstall reg key, and the program dir.
# The dir holds this script, so a detached process deletes it after a short delay.
$ErrorActionPreference = 'SilentlyContinue'
$dest = Join-Path $env:LOCALAPPDATA 'Programs\clawpm'

Get-Process clawpm -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'clawpm.lnk')
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) 'clawpm.lnk')
Remove-Item -Recurse -Force 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\clawpm'

Start-Process powershell -WindowStyle Hidden -ArgumentList @(
  '-NoProfile', '-Command',
  "Start-Sleep 2; Remove-Item -Recurse -Force '$dest'"
)
Write-Host 'clawpm uninstalled.'
