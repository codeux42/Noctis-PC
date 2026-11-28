# Génère les images de l'installeur Noctis (BMP 24 bits, exigés par NSIS).
Add-Type -AssemblyName System.Drawing

$root = 'C:\Users\Utilisateur\Desktop\Noctis PC'
$outDir = Join-Path $root 'build\branding'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$logo = [System.Drawing.Image]::FromFile((Join-Path $root 'assets\icon.png'))
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version

$accent = [System.Drawing.Color]::FromArgb(245, 158, 11)
$text = [System.Drawing.Color]::FromArgb(244, 242, 236)
$muted = [System.Drawing.Color]::FromArgb(150, 156, 169)
$bgTop = [System.Drawing.Color]::FromArgb(13, 15, 20)
$bgBot = [System.Drawing.Color]::FromArgb(6, 7, 9)

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($rect, $bgTop, $bgBot, 90)
  $g.FillRectangle($brush, $rect)
  $brush.Dispose()
  return @($bmp, $g)
}

# Halo ambré : dessiné sur une couche transparente puis composé (bords propres).
function Add-Glow($g, [int]$w, [int]$h, [int]$cx, [int]$cy, [int]$rx, [int]$ry, [int]$alpha) {
  $layer = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $lg = [System.Drawing.Graphics]::FromImage($layer)
  $lg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(($cx - $rx), ($cy - $ry), ($rx * 2), ($ry * 2))
  $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush $path
  $pg.CenterColor = [System.Drawing.Color]::FromArgb($alpha, 245, 158, 11)
  $pg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 245, 158, 11))
  $pg.CenterPoint = New-Object System.Drawing.PointF $cx, $cy
  $lg.FillPath($pg, $path)
  $pg.Dispose(); $path.Dispose(); $lg.Dispose()
  $g.DrawImage($layer, 0, 0)
  $layer.Dispose()
}

function Measure-Spaced($g, [string]$s, $font, [single]$spacing) {
  $w = 0.0
  foreach ($ch in $s.ToCharArray()) { $w += $g.MeasureString([string]$ch, $font).Width + $spacing }
  return $w - $spacing
}

function Draw-Spaced($g, [string]$s, $font, $color, [single]$x, [single]$y, [single]$spacing) {
  $brush = New-Object System.Drawing.SolidBrush $color
  $format = New-Object System.Drawing.StringFormat
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::MeasureTrailingSpaces
  $cursor = $x
  foreach ($ch in $s.ToCharArray()) {
    $g.DrawString([string]$ch, $font, $brush, $cursor, $y, $format)
    $cursor += $g.MeasureString([string]$ch, $font).Width + $spacing
  }
  $format.Dispose(); $brush.Dispose()
}

function Save-Bmp($bmp, $g, [string]$path) {
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
  "  $([System.IO.Path]::GetFileName($path))"
}

# ---------------------------------------------------------------- panneau 164x314
function New-Sidebar([string]$name, [string]$tagline) {
  $c = New-Canvas 164 314
  $bmp = $c[0]; $g = $c[1]

  Add-Glow $g 164 314 82 82 74 78 80
  Add-Glow $g 164 314 82 306 96 58 22

  $g.DrawImage($logo, (New-Object System.Drawing.Rectangle 38, 32, 88, 88))

  $titleFont = New-Object System.Drawing.Font 'Segoe UI', 13.6, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $tw = Measure-Spaced $g 'NOCTIS' $titleFont 3.4
  Draw-Spaced $g 'NOCTIS' $titleFont $text ([single]((164 - $tw) / 2)) 136 3.4
  $titleFont.Dispose()

  $line = New-Object System.Drawing.SolidBrush $accent
  $g.FillRectangle($line, 78, 158, 8, 2)
  $line.Dispose()

  # Ligne d'accroche ajustée pour tenir dans la largeur du panneau.
  $size = 6.8; $spacing = 1.0
  do {
    $tagFont = New-Object System.Drawing.Font 'Segoe UI', $size, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $tagW = Measure-Spaced $g $tagline $tagFont $spacing
    if ($tagW -gt 150) { $tagFont.Dispose(); $spacing -= 0.2; if ($spacing -lt 0) { $spacing = 0; $size -= 0.4 } }
  } while ($tagW -gt 150 -and $size -gt 5)
  Draw-Spaced $g $tagline $tagFont $muted ([single]((164 - $tagW) / 2)) 171 $spacing
  $tagFont.Dispose()

  $hair = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(26, 255, 255, 255)), 1
  $g.DrawLine($hair, 22, 272, 142, 272)
  $hair.Dispose()

  $small = New-Object System.Drawing.Font 'Segoe UI', 8.0, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $verText = "v$version"
  $vw = $g.MeasureString($verText, $small).Width
  $smallBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 244, 242, 236))
  $g.DrawString($verText, $small, $smallBrush, (164 - $vw) / 2, 279)
  $smallBrush.Dispose(); $small.Dispose()

  $site = New-Object System.Drawing.Font 'Segoe UI', 7.0, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $siteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(130, 150, 156, 169))
  $siteText = 'noctisfr.site'
  $sw = $g.MeasureString($siteText, $site).Width
  $g.DrawString($siteText, $site, $siteBrush, (164 - $sw) / 2, 293)
  $siteBrush.Dispose(); $site.Dispose()

  return Save-Bmp $bmp $g (Join-Path $outDir $name)
}

# ---------------------------------------------------------------- bandeau 150x57
function New-Header([string]$name, [string]$subtitle) {
  $c = New-Canvas 150 57
  $bmp = $c[0]; $g = $c[1]
  Add-Glow $g 150 57 26 28 46 30 40

  $g.DrawImage($logo, (New-Object System.Drawing.Rectangle 10, 13, 32, 32))

  $nameFont = New-Object System.Drawing.Font 'Segoe UI', 11.2, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  Draw-Spaced $g 'NOCTIS' $nameFont $text 48 9 1.7
  $nameFont.Dispose()

  $subFont = New-Object System.Drawing.Font 'Segoe UI', 6.8, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $subBrush = New-Object System.Drawing.SolidBrush $muted
  $g.DrawString($subtitle, $subFont, $subBrush, 48, 30)
  $subBrush.Dispose(); $subFont.Dispose()

  $accentBrush = New-Object System.Drawing.SolidBrush $accent
  $g.FillRectangle($accentBrush, 0, 55, 150, 2)
  $accentBrush.Dispose()

  return Save-Bmp $bmp $g (Join-Path $outDir $name)
}

"Images générées :"
New-Sidebar 'sidebar.bmp' 'FILMS · SÉRIES · TV EN DIRECT'
New-Sidebar 'sidebar-uninstall.bmp' 'DÉSINSTALLATION'
New-Header 'header.bmp' "Installateur · v$version"
New-Header 'header-uninstall.bmp' 'Désinstalleur'

$logo.Dispose()
"version: $version"
