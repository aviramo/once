Add-Type -AssemblyName System.Drawing

# Play Store feature graphic, 1024x500, in the Bordeaux + Gold brand.
# Flat colour only (no gradients) to match the app and the marketing site.
# The mark is pulled from mobile/assets/once-512.png, which build-icons.mjs
# regenerates, so this graphic follows the brand mark automatically.

$W = 1024
$H = 500

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# --- Brand tokens (kept in lockstep with mobile/src/colors.ts) ---
$bordeaux = [System.Drawing.Color]::FromArgb(74, 16, 32)    # #4A1020 PRIMARY
$gold     = [System.Drawing.Color]::FromArgb(230, 190, 94)  # #E6BE5E GOLD_BRIGHT
$cream    = [System.Drawing.Color]::FromArgb(241, 227, 198) # warm gold-cream ink
$muted    = [System.Drawing.Color]::FromArgb(186, 156, 106) # muted gold, sub-copy

# Flat bordeaux ground.
$bgBrush = New-Object System.Drawing.SolidBrush $bordeaux
$g.FillRectangle($bgBrush, (New-Object System.Drawing.Rectangle 0, 0, $W, $H))

# The mark. Its own tile is bordeaux too, so the square edge dissolves into the
# background and only the rings read: no seam, no visible box.
$iconPath = Join-Path $PSScriptRoot "..\mobile\assets\once-512.png"
$icon = [System.Drawing.Image]::FromFile($iconPath)

# Right side, because the layout is RTL: Hebrew reads right-to-left, so the
# strongest visual anchor sits where the eye starts.
$iconSize = 380
$iconX = $W - $iconSize - 70
$iconY = ($H - $iconSize) / 2
$g.DrawImage($icon, $iconX, $iconY, $iconSize, $iconSize)

# Wordmark "Once" - the brand name stays English across every locale.
$wordFont = New-Object System.Drawing.Font "Segoe UI", 96, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$wordBrush = New-Object System.Drawing.SolidBrush $gold
$g.DrawString("Once", $wordFont, $wordBrush, 70, 130)

$rtlFormat = New-Object System.Drawing.StringFormat ([System.Drawing.StringFormatFlags]::DirectionRightToLeft)
$rtlFormat.Alignment = [System.Drawing.StringAlignment]::Near

# Tagline (Hebrew), rendered RTL so the shaping is correct.
$taglineFont = New-Object System.Drawing.Font "Segoe UI", 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$taglineBrush = New-Object System.Drawing.SolidBrush $cream
$taglineRect = New-Object System.Drawing.RectangleF 70, 250, 470, 200
$g.DrawString("מפגש אחד בזמן אמת", $taglineFont, $taglineBrush, $taglineRect, $rtlFormat)

# Sub-tagline.
$subFont = New-Object System.Drawing.Font "Segoe UI", 26, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$subBrush = New-Object System.Drawing.SolidBrush $muted
$subRect = New-Object System.Drawing.RectangleF 70, 320, 470, 100
$g.DrawString("בלי קטלוג. בלי צ׳אטים אינסופיים.", $subFont, $subBrush, $subRect, $rtlFormat)

$out = Join-Path $PSScriptRoot "feature-graphic-he.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Wrote $out"

$g.Dispose()
$bmp.Dispose()
$icon.Dispose()
