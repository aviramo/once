Add-Type -AssemblyName System.Drawing

$W = 1024
$H = 500

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Background gradient: warm cream to slightly darker cream
$bgRect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, ([System.Drawing.Color]::FromArgb(255, 252, 244)), ([System.Drawing.Color]::FromArgb(248, 222, 184)), ([System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
$g.FillRectangle($bgBrush, $bgRect)

# Load the icon (once-512.png, 512x512)
$iconPath = "C:\Users\ofira\Desktop\once\mobile\assets\once-512.png"
$icon = [System.Drawing.Image]::FromFile($iconPath)

# Place icon on the right side (because layout is RTL — Hebrew reads right-to-left,
# and the most prominent visual anchor sits where the eye starts).
# Icon target size: 380x380, vertically centered, right-aligned with 60px margin.
$iconSize = 380
$iconX = $W - $iconSize - 70
$iconY = ($H - $iconSize) / 2
$g.DrawImage($icon, $iconX, $iconY, $iconSize, $iconSize)

# Text on the left side. Hebrew with RTL.
$coral = [System.Drawing.Color]::FromArgb(253, 112, 86)   # #FD7056
$dark  = [System.Drawing.Color]::FromArgb(50, 30, 20)

# Wordmark "Once" — large, English (brand name is English across all locales)
$wordFont = New-Object System.Drawing.Font "Segoe UI", 96, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$wordBrush = New-Object System.Drawing.SolidBrush $coral
$g.DrawString("Once", $wordFont, $wordBrush, 70, 130)

# Tagline (Hebrew) — under the wordmark, in dark color
$taglineFont = New-Object System.Drawing.Font "Segoe UI", 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$taglineBrush = New-Object System.Drawing.SolidBrush $dark
$rtlFormat = New-Object System.Drawing.StringFormat ([System.Drawing.StringFormatFlags]::DirectionRightToLeft)
$rtlFormat.Alignment = [System.Drawing.StringAlignment]::Near

# Tagline area: left-aligned visually, rendered RTL so Hebrew shapes correctly
$taglineRect = New-Object System.Drawing.RectangleF 70, 250, 540, 200
$g.DrawString("מפגש אחד בזמן אמת", $taglineFont, $taglineBrush, $taglineRect, $rtlFormat)

# Sub-tagline
$subFont = New-Object System.Drawing.Font "Segoe UI", 26, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$subBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 80, 60))
$subRect = New-Object System.Drawing.RectangleF 70, 320, 540, 100
$g.DrawString("בלי קטלוג. בלי צ׳אטים אינסופיים.", $subFont, $subBrush, $subRect, $rtlFormat)

# Save
$out = "C:\Users\ofira\Desktop\once\store-listing\feature-graphic-he.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Wrote $out"

$g.Dispose()
$bmp.Dispose()
$icon.Dispose()
