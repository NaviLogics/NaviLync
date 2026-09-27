# Starts the built NaviLync.exe on a clean Windows machine (the CI runner) and prints, as base64 PNG lines, the icons
# its window hands to Windows (WM_GETICON: ICON_BIG for the taskbar and Alt-Tab, ICON_SMALL for the title bar) and a
# screenshot of the screen with the taskbar. Diagnostics only: the build does not depend on it.
#
# Usage: pwsh scripts/windows-icon-smoke.ps1 dist/win-unpacked/NaviLync.exe
param([Parameter(Mandatory = $true)][string]$ExePath)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowIcons {
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")] public static extern IntPtr GetClassLongPtr(IntPtr hWnd, int index);
}
'@

function Write-Png([string]$Label, [System.Drawing.Bitmap]$Bitmap) {
  $stream = New-Object System.IO.MemoryStream
  $Bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "$Label $($Bitmap.Width)x$($Bitmap.Height) $([Convert]::ToBase64String($stream.ToArray()))"
}

$process = Start-Process -FilePath $ExePath -PassThru
try {
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    $process.Refresh()
    if ($process.MainWindowHandle -ne [IntPtr]::Zero -and $process.MainWindowTitle) { break }
    Start-Sleep -Seconds 1
  }
  Start-Sleep -Seconds 15
  $process.Refresh()
  $window = $process.MainWindowHandle
  Write-Output "Window: 0x$($window.ToString('X')) '$($process.MainWindowTitle)'"

  $WM_GETICON = 0x7F
  foreach ($kind in @(@{ Name = 'ICON_BIG'; Value = 1 }, @{ Name = 'ICON_SMALL'; Value = 0 }, @{ Name = 'ICON_SMALL2'; Value = 2 })) {
    $icon = [WindowIcons]::SendMessage($window, $WM_GETICON, [IntPtr]$kind.Value, [IntPtr]::Zero)
    if ($icon -eq [IntPtr]::Zero) { Write-Output "$($kind.Name) none"; continue }
    Write-Png $kind.Name ([System.Drawing.Icon]::FromHandle($icon).ToBitmap())
  }
  $GCLP_HICON = -14
  $classIcon = [WindowIcons]::GetClassLongPtr($window, $GCLP_HICON)
  if ($classIcon -eq [IntPtr]::Zero) { Write-Output 'CLASS_ICON none' } else {
    Write-Png 'CLASS_ICON' ([System.Drawing.Icon]::FromHandle($classIcon).ToBitmap())
  }

  $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $screen = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  [System.Drawing.Graphics]::FromImage($screen).CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
  Write-Png 'SCREEN' $screen
  $taskbarHeight = [Math]::Min(80, $bounds.Height)
  Write-Png 'TASKBAR' $screen.Clone((New-Object System.Drawing.Rectangle 0, ($bounds.Height - $taskbarHeight), $bounds.Width, $taskbarHeight), $screen.PixelFormat)
} finally {
  Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($ExePath)) -ErrorAction SilentlyContinue | Stop-Process -Force
}
