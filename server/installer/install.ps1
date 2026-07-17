# clawpm installer - launched by the IExpress package after extraction to a temp dir.
# Extracts payload.zip into the user Programs dir, makes shortcuts, registers uninstall, launches.
# All user-scope; no admin required. Pure ASCII on purpose: PS 5.1 -File mis-decodes non-BOM UTF-8.
$ErrorActionPreference = 'Stop'
$src  = $PSScriptRoot
$dest = Join-Path $env:LOCALAPPDATA 'Programs\clawpm'

if (Test-Path $dest) {
  Get-Process clawpm -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep 1
  Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $src 'payload.zip'), $dest)

$exe = Join-Path $dest 'clawpm.exe'
$sh  = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $lnk = $sh.CreateShortcut((Join-Path $dir 'clawpm.lnk'))
  $lnk.TargetPath       = $exe
  $lnk.WorkingDirectory = $dest
  $lnk.IconLocation     = "$exe,0"
  $lnk.Save()
}

$reg = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\clawpm'
$uninstall = 'powershell -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $dest 'uninstall.ps1') + '"'
New-Item -Path $reg -Force | Out-Null
Set-ItemProperty -Path $reg -Name 'DisplayName'     -Value 'clawpm'
Set-ItemProperty -Path $reg -Name 'DisplayIcon'     -Value $exe
Set-ItemProperty -Path $reg -Name 'InstallLocation' -Value $dest
Set-ItemProperty -Path $reg -Name 'UninstallString' -Value $uninstall
Set-ItemProperty -Path $reg -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $reg -Name 'NoRepair' -Value 1 -Type DWord

Start-Process -FilePath $exe
