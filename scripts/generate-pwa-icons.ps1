param([string]$OutputDirectory = "public")

Add-Type -AssemblyName System.Drawing

function New-KitchenIcon([int]$Size, [string]$Path) {
  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(49, 91, 70))

  $cream = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 254, 249))
  $orange = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(231, 125, 66))
  $lightGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, 177, 132))

  $margin = [int]($Size * 0.17)
  $plateSize = $Size - (2 * $margin)
  $graphics.FillEllipse($cream, $margin, $margin, $plateSize, $plateSize)
  $graphics.FillEllipse($orange, [int]($Size * .38), [int]($Size * .35), [int]($Size * .24), [int]($Size * .24))
  $graphics.FillEllipse($lightGreen, [int]($Size * .29), [int]($Size * .49), [int]($Size * .18), [int]($Size * .29))
  $graphics.FillEllipse($lightGreen, [int]($Size * .53), [int]($Size * .49), [int]($Size * .18), [int]($Size * .29))

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $cream.Dispose(); $orange.Dispose(); $lightGreen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

$resolved = Join-Path (Get-Location) $OutputDirectory
New-Item -ItemType Directory -Path $resolved -Force | Out-Null
New-KitchenIcon 192 (Join-Path $resolved "icon-192.png")
New-KitchenIcon 512 (Join-Path $resolved "icon-512.png")

