Add-Type -AssemblyName System.Drawing

# Phone screenshot mockups for Google Play store listing.
# Output: 1080x1920 PNGs, one per screen.

$OUT = "C:\Users\ofira\Desktop\once\store-listing"
$ICON = "C:\Users\ofira\Desktop\once\mobile\assets\once-512.png"
$PHOTOS = "C:\Users\ofira\Desktop\once\mobile\assets\photos"

# Brand
$CORAL  = [System.Drawing.Color]::FromArgb(253, 112, 86)   # #FD7056
$CREAM  = [System.Drawing.Color]::FromArgb(248, 222, 184)  # #F8DEB8
$BG     = [System.Drawing.Color]::FromArgb(255, 252, 244)  # warm white
$DARK   = [System.Drawing.Color]::FromArgb(50, 30, 20)
$MUTED  = [System.Drawing.Color]::FromArgb(140, 110, 90)
$LINE   = [System.Drawing.Color]::FromArgb(235, 220, 200)
$PHONE_BEZEL = [System.Drawing.Color]::FromArgb(28, 22, 18)

$W = 1080
$H = 1920

function New-Canvas {
    $bmp = New-Object System.Drawing.Bitmap $W, $H
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    return @{ Bmp = $bmp; G = $g }
}

function Save-Canvas($c, $name) {
    $path = Join-Path $OUT $name
    $c.Bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $c.G.Dispose()
    $c.Bmp.Dispose()
    Write-Host "Wrote $path"
}

function Get-RtlFmt {
    $f = New-Object System.Drawing.StringFormat ([System.Drawing.StringFormatFlags]::DirectionRightToLeft)
    return $f
}
function Get-LtrFmt {
    return (New-Object System.Drawing.StringFormat)
}

function Draw-RoundedRect($g, $brush, $x, $y, $w, $h, $r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $r*2, $r*2, 180, 90)
    $path.AddArc($x + $w - $r*2, $y, $r*2, $r*2, 270, 90)
    $path.AddArc($x + $w - $r*2, $y + $h - $r*2, $r*2, $r*2, 0, 90)
    $path.AddArc($x, $y + $h - $r*2, $r*2, $r*2, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)
    $path.Dispose()
}

function Draw-RoundedRectStroke($g, $pen, $x, $y, $w, $h, $r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $r*2, $r*2, 180, 90)
    $path.AddArc($x + $w - $r*2, $y, $r*2, $r*2, 270, 90)
    $path.AddArc($x + $w - $r*2, $y + $h - $r*2, $r*2, $r*2, 0, 90)
    $path.AddArc($x, $y + $h - $r*2, $r*2, $r*2, 90, 90)
    $path.CloseFigure()
    $g.DrawPath($pen, $path)
    $path.Dispose()
}

function Draw-StatusBar($g, $bgColor, $tint) {
    # Simple status bar mockup at the very top
    $brush = New-Object System.Drawing.SolidBrush $bgColor
    $g.FillRectangle($brush, 0, 0, $W, 80)
    $tintBrush = New-Object System.Drawing.SolidBrush $tint
    $f = New-Object System.Drawing.Font "Segoe UI", 28, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    # Time on right (Israeli phones show time on left in iOS, but Android typically right)
    $g.DrawString("9:41", $f, $tintBrush, 50, 28)
    # Battery indicator on left
    $iconF = New-Object System.Drawing.Font "Segoe UI", 28, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $g.DrawString("100%", $iconF, $tintBrush, $W - 130, 28)
    $brush.Dispose(); $tintBrush.Dispose(); $f.Dispose(); $iconF.Dispose()
}

# ============================================================
# Screen 1: Hero / Auth screen
# ============================================================
function Draw-HeroScreen {
    $c = New-Canvas
    $g = $c.G

    # Background gradient cream
    $bgRect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, ([System.Drawing.Color]::FromArgb(255, 252, 244)), $CREAM, ([System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillRectangle($bg, $bgRect)

    Draw-StatusBar $g $CREAM $DARK

    # Icon centered, large
    $icon = [System.Drawing.Image]::FromFile($ICON)
    $iconSize = 460
    $g.DrawImage($icon, ($W - $iconSize)/2, 280, $iconSize, $iconSize)
    $icon.Dispose()

    # "Once" wordmark
    $wordF = New-Object System.Drawing.Font "Segoe UI", 130, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $coralB = New-Object System.Drawing.SolidBrush $CORAL
    $center = New-Object System.Drawing.StringFormat
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("Once", $wordF, $coralB, ($W/2), 800, $center)

    # Hebrew tagline (RTL): "מפגש אחד\nבזמן אמת"
    $tagF = New-Object System.Drawing.Font "Segoe UI", 78, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $darkB = New-Object System.Drawing.SolidBrush $DARK
    $rtlCenter = Get-RtlFmt
    $rtlCenter.Alignment = [System.Drawing.StringAlignment]::Center
    $rtlCenter.LineAlignment = [System.Drawing.StringAlignment]::Near
    $tagRect = New-Object System.Drawing.RectangleF 60, 1000, ($W - 120), 320
    $g.DrawString("מפגש אחד`nבזמן אמת", $tagF, $darkB, $tagRect, $rtlCenter)

    # Sub: "לא קטלוג. לא צ׳אטים אינסופיים."
    $subF = New-Object System.Drawing.Font "Segoe UI", 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $mutedB = New-Object System.Drawing.SolidBrush $MUTED
    $subRect = New-Object System.Drawing.RectangleF 60, 1310, ($W - 120), 80
    $g.DrawString("לא קטלוג. לא צ׳אטים אינסופיים.", $subF, $mutedB, $subRect, $rtlCenter)

    # Mock CTA button "כניסה עם Google"
    $btnW = 800; $btnH = 130; $btnX = ($W - $btnW)/2; $btnY = 1500
    $btnBrush = New-Object System.Drawing.SolidBrush $DARK
    Draw-RoundedRect $g $btnBrush $btnX $btnY $btnW $btnH 65
    $btnFont = New-Object System.Drawing.Font "Segoe UI", 44, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $whiteB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $btnTextRect = New-Object System.Drawing.RectangleF $btnX, ($btnY + 35), $btnW, 80
    $g.DrawString("כניסה עם Google", $btnFont, $whiteB, $btnTextRect, $rtlCenter)

    # Secondary button "כניסה עם Apple"
    $btnY2 = 1670
    $btnPen = New-Object System.Drawing.Pen $DARK, 4
    Draw-RoundedRectStroke $g $btnPen $btnX $btnY2 $btnW $btnH 65
    $btnTextRect2 = New-Object System.Drawing.RectangleF $btnX, ($btnY2 + 35), $btnW, 80
    $g.DrawString("כניסה עם Apple", $btnFont, $darkB, $btnTextRect2, $rtlCenter)

    Save-Canvas $c "screenshot-1-hero.png"
}

# ============================================================
# Screen 2: Home — one candidate
# ============================================================
function Draw-HomeScreen {
    $c = New-Canvas
    $g = $c.G

    # Background
    $bgB = New-Object System.Drawing.SolidBrush $BG
    $g.FillRectangle($bgB, 0, 0, $W, $H)

    Draw-StatusBar $g $BG $DARK

    # Top header: small "ממש עכשיו" pill
    $pillF = New-Object System.Drawing.Font "Segoe UI", 30, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $pillBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 235))
    $pillW = 280; $pillH = 70
    $pillX = ($W - $pillW)/2; $pillY = 130
    Draw-RoundedRect $g $pillBrush $pillX $pillY $pillW $pillH 35
    $coralB = New-Object System.Drawing.SolidBrush $CORAL
    $rtlCenter = Get-RtlFmt
    $rtlCenter.Alignment = [System.Drawing.StringAlignment]::Center
    $pillTxtRect = New-Object System.Drawing.RectangleF $pillX, ($pillY + 18), $pillW, 50
    $g.DrawString("ממש עכשיו", $pillF, $coralB, $pillTxtRect, $rtlCenter)

    # Main profile photo card (rounded)
    $cardX = 80; $cardY = 250; $cardW = $W - 160; $cardH = 1180
    $photo = [System.Drawing.Image]::FromFile((Join-Path $PHOTOS "1.jpg"))
    # Clip to rounded rect
    $clipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = 60
    $clipPath.AddArc($cardX, $cardY, $r*2, $r*2, 180, 90)
    $clipPath.AddArc($cardX + $cardW - $r*2, $cardY, $r*2, $r*2, 270, 90)
    $clipPath.AddArc($cardX + $cardW - $r*2, $cardY + $cardH - $r*2, $r*2, $r*2, 0, 90)
    $clipPath.AddArc($cardX, $cardY + $cardH - $r*2, $r*2, $r*2, 90, 90)
    $clipPath.CloseFigure()
    $g.SetClip($clipPath)
    # Cover-fit: scale so the shorter dim matches
    $ph = $photo.Height; $pw = $photo.Width
    $scale = [Math]::Max($cardW / $pw, $cardH / $ph)
    $drawW = $pw * $scale; $drawH = $ph * $scale
    $drawX = $cardX + ($cardW - $drawW)/2
    $drawY = $cardY + ($cardH - $drawH)/2
    $g.DrawImage($photo, $drawX, $drawY, $drawW, $drawH)
    $g.ResetClip()
    $photo.Dispose()

    # Gradient overlay at bottom of card for legibility
    $overlayRect = New-Object System.Drawing.Rectangle $cardX, ($cardY + $cardH - 380), $cardW, 380
    $overlay = New-Object System.Drawing.Drawing2D.LinearGradientBrush $overlayRect, ([System.Drawing.Color]::FromArgb(0, 0, 0, 0)), ([System.Drawing.Color]::FromArgb(190, 0, 0, 0)), ([System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.SetClip($clipPath)
    $g.FillRectangle($overlay, $overlayRect)
    $g.ResetClip()

    # Name + age + distance on photo
    $nameF = New-Object System.Drawing.Font "Segoe UI", 70, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $whiteB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $rtlNear = Get-RtlFmt
    $rtlNear.Alignment = [System.Drawing.StringAlignment]::Near
    $nameRect = New-Object System.Drawing.RectangleF ($cardX + 50), ($cardY + $cardH - 280), ($cardW - 100), 100
    $g.DrawString("מאיה, 29", $nameF, $whiteB, $nameRect, $rtlNear)

    $distF = New-Object System.Drawing.Font "Segoe UI", 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $distB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(230, 255, 255, 255))
    $distRect = New-Object System.Drawing.RectangleF ($cardX + 50), ($cardY + $cardH - 180), ($cardW - 100), 60
    $g.DrawString("◯  800 מ׳ ממך", $distF, $distB, $distRect, $rtlNear)

    $bioF = New-Object System.Drawing.Font "Segoe UI", 32, ([System.Drawing.FontStyle]::Italic), ([System.Drawing.GraphicsUnit]::Pixel)
    $bioRect = New-Object System.Drawing.RectangleF ($cardX + 50), ($cardY + $cardH - 110), ($cardW - 100), 60
    $g.DrawString("מחפשת ערב נינוח", $bioF, $distB, $bioRect, $rtlNear)

    # Big invite button
    $btnW = 800; $btnH = 140; $btnX = ($W - $btnW)/2; $btnY = $H - 280
    $coralB2 = New-Object System.Drawing.SolidBrush $CORAL
    Draw-RoundedRect $g $coralB2 $btnX $btnY $btnW $btnH 70
    $btnF = New-Object System.Drawing.Font "Segoe UI", 48, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $btnRect = New-Object System.Drawing.RectangleF $btnX, ($btnY + 38), $btnW, 80
    $g.DrawString("שליחת הזמנה", $btnF, $whiteB, $btnRect, $rtlCenter)

    Save-Canvas $c "screenshot-2-home.png"
}

# ============================================================
# Screen 3: Incoming invitation
# ============================================================
function Draw-InvitationScreen {
    $c = New-Canvas
    $g = $c.G

    # Background — coral wash to signal urgency
    $bgRect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bgRect, ([System.Drawing.Color]::FromArgb(255, 240, 235)), ([System.Drawing.Color]::FromArgb(253, 112, 86, 200)), ([System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillRectangle($bg, $bgRect)

    Draw-StatusBar $g ([System.Drawing.Color]::FromArgb(255, 240, 235)) $DARK

    # Header
    $rtlCenter = Get-RtlFmt
    $rtlCenter.Alignment = [System.Drawing.StringAlignment]::Center
    $hdrF = New-Object System.Drawing.Font "Segoe UI", 50, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $darkB = New-Object System.Drawing.SolidBrush $DARK
    $hdrRect = New-Object System.Drawing.RectangleF 60, 160, ($W - 120), 80
    $g.DrawString("הזמנה חדשה", $hdrF, $darkB, $hdrRect, $rtlCenter)

    $subF = New-Object System.Drawing.Font "Segoe UI", 36, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $mutedB = New-Object System.Drawing.SolidBrush $MUTED
    $subRect = New-Object System.Drawing.RectangleF 60, 240, ($W - 120), 60
    $g.DrawString("מישהו רוצה להתחיל איתך שיחה", $subF, $mutedB, $subRect, $rtlCenter)

    # Round avatar
    $avatarSize = 460
    $ax = ($W - $avatarSize)/2; $ay = 360
    $photo = [System.Drawing.Image]::FromFile((Join-Path $PHOTOS "3.jpg"))
    $clipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clipPath.AddEllipse($ax, $ay, $avatarSize, $avatarSize)
    $g.SetClip($clipPath)
    $ph = $photo.Height; $pw = $photo.Width
    $scale = [Math]::Max($avatarSize / $pw, $avatarSize / $ph)
    $drawW = $pw * $scale; $drawH = $ph * $scale
    $drawX = $ax + ($avatarSize - $drawW)/2
    $drawY = $ay + ($avatarSize - $drawH)/2
    $g.DrawImage($photo, $drawX, $drawY, $drawW, $drawH)
    $g.ResetClip()
    $photo.Dispose()
    # Coral ring
    $ringPen = New-Object System.Drawing.Pen $CORAL, 12
    $g.DrawEllipse($ringPen, $ax, $ay, $avatarSize, $avatarSize)

    # Name
    $nameF = New-Object System.Drawing.Font "Segoe UI", 70, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $nameRect = New-Object System.Drawing.RectangleF 60, 870, ($W - 120), 100
    $g.DrawString("דניאל, 31", $nameF, $darkB, $nameRect, $rtlCenter)

    # Distance
    $distF = New-Object System.Drawing.Font "Segoe UI", 36, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $distRect = New-Object System.Drawing.RectangleF 60, 960, ($W - 120), 60
    $g.DrawString("1.2 ק״מ ממך", $distF, $mutedB, $distRect, $rtlCenter)

    # Timer pill
    $timerW = 380; $timerH = 90
    $tx = ($W - $timerW)/2; $ty = 1060
    $timerBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 250, 240))
    Draw-RoundedRect $g $timerBg $tx $ty $timerW $timerH 45
    $timerF = New-Object System.Drawing.Font "Segoe UI", 38, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $timerRect = New-Object System.Drawing.RectangleF $tx, ($ty + 22), $timerW, 60
    $g.DrawString("⏱  00:29:15", $timerF, $darkB, $timerRect, $rtlCenter)

    # Approve button (coral)
    $whiteB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $btnW = 880; $btnH = 140; $btnX = ($W - $btnW)/2
    $approveY = 1480
    $coralB = New-Object System.Drawing.SolidBrush $CORAL
    Draw-RoundedRect $g $coralB $btnX $approveY $btnW $btnH 70
    $btnF = New-Object System.Drawing.Font "Segoe UI", 48, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $approveRect = New-Object System.Drawing.RectangleF $btnX, ($approveY + 38), $btnW, 80
    $g.DrawString("אישור", $btnF, $whiteB, $approveRect, $rtlCenter)

    # Decline button (outline)
    $declineY = 1650
    $borderPen = New-Object System.Drawing.Pen $DARK, 4
    Draw-RoundedRectStroke $g $borderPen $btnX $declineY $btnW $btnH 70
    $declineRect = New-Object System.Drawing.RectangleF $btnX, ($declineY + 38), $btnW, 80
    $g.DrawString("דחייה", $btnF, $darkB, $declineRect, $rtlCenter)

    Save-Canvas $c "screenshot-3-invitation.png"
}

# ============================================================
# Screen 4: Chat
# ============================================================
function Draw-ChatScreen {
    $c = New-Canvas
    $g = $c.G

    # Background
    $bgB = New-Object System.Drawing.SolidBrush $BG
    $g.FillRectangle($bgB, 0, 0, $W, $H)

    Draw-StatusBar $g $BG $DARK

    # Header strip with back arrow + avatar + name
    $hdrH = 200
    $hdrBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillRectangle($hdrBg, 0, 80, $W, $hdrH)
    $linePen = New-Object System.Drawing.Pen $LINE, 2
    $g.DrawLine($linePen, 0, (80 + $hdrH), $W, (80 + $hdrH))

    # Avatar
    $avSize = 130
    $avX = $W - 60 - $avSize  # right side (RTL)
    $avY = 100
    $photo = [System.Drawing.Image]::FromFile((Join-Path $PHOTOS "5.jpg"))
    $clipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clipPath.AddEllipse($avX, $avY, $avSize, $avSize)
    $g.SetClip($clipPath)
    $ph = $photo.Height; $pw = $photo.Width
    $scale = [Math]::Max($avSize / $pw, $avSize / $ph)
    $drawW = $pw * $scale; $drawH = $ph * $scale
    $g.DrawImage($photo, ($avX + ($avSize - $drawW)/2), ($avY + ($avSize - $drawH)/2), $drawW, $drawH)
    $g.ResetClip()
    $photo.Dispose()

    # Name
    $nameF = New-Object System.Drawing.Font "Segoe UI", 44, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $darkB = New-Object System.Drawing.SolidBrush $DARK
    $rtlNear = Get-RtlFmt
    $rtlNear.Alignment = [System.Drawing.StringAlignment]::Near
    # text positioned to the right of avatar (which is on right edge); so place text to its left.
    $nameRect = New-Object System.Drawing.RectangleF 200, 110, ($avX - 220), 60
    $g.DrawString("נועה", $nameF, $darkB, $nameRect, $rtlNear)
    # Subline
    $statusF = New-Object System.Drawing.Font "Segoe UI", 28, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $coralB = New-Object System.Drawing.SolidBrush $CORAL
    $statusRect = New-Object System.Drawing.RectangleF 200, 175, ($avX - 220), 50
    $g.DrawString("● מחוברת עכשיו", $statusF, $coralB, $statusRect, $rtlNear)

    # Bubbles
    $bubbleF = New-Object System.Drawing.Font "Segoe UI", 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $whiteB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

    # Helper: incoming bubble (gray, right side because RTL? actually in RTL chat, "incoming" bubbles
    # are typically on the LEFT side when reading right-to-left. Let me put me=right, them=left.
    # Wait: in RTL Hebrew chat (WhatsApp Hebrew), "you" is on the right and "them" on the left.

    # Bubble 1: them (left side) — image-style placeholder text
    $b1Text = "היי, מה התוכניות לערב?"
    $b1W = 600; $b1H = 110
    $b1X = 60; $b1Y = 380
    $grayB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(238, 230, 220))
    Draw-RoundedRect $g $grayB $b1X $b1Y $b1W $b1H 50
    $rtlBubble = Get-RtlFmt
    $rtlBubble.Alignment = [System.Drawing.StringAlignment]::Near
    $rtlBubble.LineAlignment = [System.Drawing.StringAlignment]::Center
    $b1TxtRect = New-Object System.Drawing.RectangleF ($b1X + 40), $b1Y, ($b1W - 80), $b1H
    $g.DrawString($b1Text, $bubbleF, $darkB, $b1TxtRect, $rtlBubble)

    # Bubble 2: me (right side) — coral
    $b2Text = "חשבתי על קפה ב‐Florentin"
    $b2W = 700; $b2H = 110
    $b2X = $W - 60 - $b2W; $b2Y = 530
    Draw-RoundedRect $g $coralB $b2X $b2Y $b2W $b2H 50
    $b2TxtRect = New-Object System.Drawing.RectangleF ($b2X + 40), $b2Y, ($b2W - 80), $b2H
    $g.DrawString($b2Text, $bubbleF, $whiteB, $b2TxtRect, $rtlBubble)

    # Bubble 3: them
    $b3Text = "מעולה, בעוד חצי שעה?"
    $b3W = 580; $b3H = 110
    $b3X = 60; $b3Y = 680
    Draw-RoundedRect $g $grayB $b3X $b3Y $b3W $b3H 50
    $b3TxtRect = New-Object System.Drawing.RectangleF ($b3X + 40), $b3Y, ($b3W - 80), $b3H
    $g.DrawString($b3Text, $bubbleF, $darkB, $b3TxtRect, $rtlBubble)

    # Bubble 4: me — confirmation
    $b4Text = "מושלם, רואים שם"
    $b4W = 580; $b4H = 110
    $b4X = $W - 60 - $b4W; $b4Y = 830
    Draw-RoundedRect $g $coralB $b4X $b4Y $b4W $b4H 50
    $b4TxtRect = New-Object System.Drawing.RectangleF ($b4X + 40), $b4Y, ($b4W - 80), $b4H
    $g.DrawString($b4Text, $bubbleF, $whiteB, $b4TxtRect, $rtlBubble)

    # System / event row
    $eventF = New-Object System.Drawing.Font "Segoe UI", 26, ([System.Drawing.FontStyle]::Italic), ([System.Drawing.GraphicsUnit]::Pixel)
    $mutedB = New-Object System.Drawing.SolidBrush $MUTED
    $rtlCenter = Get-RtlFmt
    $rtlCenter.Alignment = [System.Drawing.StringAlignment]::Center
    $eventRect = New-Object System.Drawing.RectangleF 0, 990, $W, 50
    $g.DrawString("✦ נוצר חיבור הדדי", $eventF, $mutedB, $eventRect, $rtlCenter)

    # Bubble 5: them — voice message mockup
    $voiceB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(238, 230, 220))
    $vbW = 620; $vbH = 130; $vbX = 60; $vbY = 1080
    Draw-RoundedRect $g $voiceB $vbX $vbY $vbW $vbH 65
    # Play button circle
    $playSize = 80
    $playX = $vbX + 30; $playY = $vbY + ($vbH - $playSize)/2
    $coralB2 = New-Object System.Drawing.SolidBrush $CORAL
    $g.FillEllipse($coralB2, $playX, $playY, $playSize, $playSize)
    # Play triangle (white)
    $triPts = @(
        (New-Object System.Drawing.PointF ($playX + 32), ($playY + 24)),
        (New-Object System.Drawing.PointF ($playX + 32), ($playY + 56)),
        (New-Object System.Drawing.PointF ($playX + 60), ($playY + 40))
    )
    $g.FillPolygon($whiteB, $triPts)
    # Waveform bars
    $waveX0 = $playX + $playSize + 30
    $bandY = $vbY + $vbH/2
    $coralB3 = New-Object System.Drawing.SolidBrush $CORAL
    for ($i = 0; $i -lt 28; $i++) {
        $bh = (10 + (($i * 73) % 60))
        $g.FillRectangle($coralB3, ($waveX0 + $i * 14), ($bandY - $bh/2), 6, $bh)
    }
    # Duration
    $durF = New-Object System.Drawing.Font "Segoe UI", 26, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $durRect = New-Object System.Drawing.RectangleF ($vbX + $vbW - 130), ($vbY + 88), 100, 35
    $rtlNear2 = Get-RtlFmt
    $rtlNear2.Alignment = [System.Drawing.StringAlignment]::Near
    $g.DrawString("0:14", $durF, $darkB, $durRect, $rtlNear2)

    # Footer caption strip — call out the USP
    $footerY = $H - 220
    $footerBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 235))
    $g.FillRectangle($footerBg, 0, $footerY, $W, 220)
    $foF = New-Object System.Drawing.Font "Segoe UI", 44, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $foRect = New-Object System.Drawing.RectangleF 60, ($footerY + 50), ($W - 120), 60
    $g.DrawString("שיחה אחת. בלעדית לשניכם.", $foF, $coralB, $foRect, $rtlCenter)
    $foSubF = New-Object System.Drawing.Font "Segoe UI", 30, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $foSubRect = New-Object System.Drawing.RectangleF 60, ($footerY + 130), ($W - 120), 50
    $g.DrawString("הודעות, תמונות, הקלטות קוליות, מיקום", $foSubF, $mutedB, $foSubRect, $rtlCenter)

    Save-Canvas $c "screenshot-4-chat.png"
}

# ============================================================
# Screen 5: Viewers (page2)
# ============================================================
function Draw-ViewersScreen {
    $c = New-Canvas
    $g = $c.G

    $bgB = New-Object System.Drawing.SolidBrush $BG
    $g.FillRectangle($bgB, 0, 0, $W, $H)
    Draw-StatusBar $g $BG $DARK

    $rtlCenter = Get-RtlFmt
    $rtlCenter.Alignment = [System.Drawing.StringAlignment]::Center
    $rtlNear = Get-RtlFmt
    $rtlNear.Alignment = [System.Drawing.StringAlignment]::Near

    # Header
    $hdrF = New-Object System.Drawing.Font "Segoe UI", 50, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $darkB = New-Object System.Drawing.SolidBrush $DARK
    $hdrRect = New-Object System.Drawing.RectangleF 60, 160, ($W - 120), 80
    $g.DrawString("מי רואה אותי", $hdrF, $darkB, $hdrRect, $rtlCenter)

    $subF = New-Object System.Drawing.Font "Segoe UI", 32, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $mutedB = New-Object System.Drawing.SolidBrush $MUTED
    $subRect = New-Object System.Drawing.RectangleF 60, 250, ($W - 120), 60
    $g.DrawString("3 אנשים מסתכלים על הפרופיל שלך עכשיו", $subF, $mutedB, $subRect, $rtlCenter)

    # Watcher cards
    $watchers = @(
        @{ Photo = "2.jpg"; Name = "אורי, 33"; Dist = "300 מ׳ ממך"; Time = "ממש עכשיו" },
        @{ Photo = "4.jpg"; Name = "תמר, 28"; Dist = "1.4 ק״מ ממך"; Time = "לפני דקה" },
        @{ Photo = "6.jpg"; Name = "יואב, 35"; Dist = "2.8 ק״מ ממך"; Time = "לפני 4 דקות" }
    )

    $cardX = 60; $cardW = $W - 120; $cardH = 360; $r = 50
    $cardY = 410
    $whiteB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $coralB = New-Object System.Drawing.SolidBrush $CORAL

    foreach ($watcher in $watchers) {
        # Card bg with subtle shadow stand-in
        $shadowB = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(20, 0, 0, 0))
        Draw-RoundedRect $g $shadowB ($cardX + 6) ($cardY + 8) $cardW $cardH $r
        Draw-RoundedRect $g $whiteB $cardX $cardY $cardW $cardH $r

        # Photo on right (RTL)
        $imgSize = 280
        $imgX = $cardX + $cardW - $imgSize - 40
        $imgY = $cardY + 40
        $photo = [System.Drawing.Image]::FromFile((Join-Path $PHOTOS $watcher.Photo))
        $clipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $clipPath.AddArc($imgX, $imgY, 50, 50, 180, 90)
        $clipPath.AddArc($imgX + $imgSize - 50, $imgY, 50, 50, 270, 90)
        $clipPath.AddArc($imgX + $imgSize - 50, $imgY + $imgSize - 50, 50, 50, 0, 90)
        $clipPath.AddArc($imgX, $imgY + $imgSize - 50, 50, 50, 90, 90)
        $clipPath.CloseFigure()
        $g.SetClip($clipPath)
        $ph = $photo.Height; $pw = $photo.Width
        $scale = [Math]::Max($imgSize / $pw, $imgSize / $ph)
        $drawW = $pw * $scale; $drawH = $ph * $scale
        $g.DrawImage($photo, ($imgX + ($imgSize - $drawW)/2), ($imgY + ($imgSize - $drawH)/2), $drawW, $drawH)
        $g.ResetClip()
        $photo.Dispose()

        # Name + dist + time on left (RTL: text rendered RTL within left-aligned box)
        $textBoxX = $cardX + 50
        $textBoxW = $imgX - $textBoxX - 30

        $nF = New-Object System.Drawing.Font "Segoe UI", 50, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
        $nRect = New-Object System.Drawing.RectangleF $textBoxX, ($cardY + 70), $textBoxW, 70
        $g.DrawString($watcher.Name, $nF, $darkB, $nRect, $rtlNear)

        $dF = New-Object System.Drawing.Font "Segoe UI", 32, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
        $dRect = New-Object System.Drawing.RectangleF $textBoxX, ($cardY + 150), $textBoxW, 50
        $g.DrawString($watcher.Dist, $dF, $mutedB, $dRect, $rtlNear)

        $tF = New-Object System.Drawing.Font "Segoe UI", 28, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
        $tRect = New-Object System.Drawing.RectangleF $textBoxX, ($cardY + 220), $textBoxW, 50
        $g.DrawString("● $($watcher.Time)", $tF, $coralB, $tRect, $rtlNear)

        $cardY += $cardH + 40
    }

    # Footer caption
    $footerY = $H - 220
    $footerBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 235))
    $g.FillRectangle($footerBg, 0, $footerY, $W, 220)
    $foF = New-Object System.Drawing.Font "Segoe UI", 44, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $foRect = New-Object System.Drawing.RectangleF 60, ($footerY + 50), ($W - 120), 60
    $g.DrawString("רואים מי מסתכל. בזמן אמת.", $foF, $coralB, $foRect, $rtlCenter)
    $foSubF = New-Object System.Drawing.Font "Segoe UI", 30, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $foSubRect = New-Object System.Drawing.RectangleF 60, ($footerY + 130), ($W - 120), 50
    $g.DrawString("בלי דברים מאחורי הגב", $foSubF, $mutedB, $foSubRect, $rtlCenter)

    Save-Canvas $c "screenshot-5-viewers.png"
}

# ============================================================
# Run all
# ============================================================
Draw-HeroScreen
Draw-HomeScreen
Draw-InvitationScreen
Draw-ChatScreen
Draw-ViewersScreen

Write-Host ""
Write-Host "All screenshots written to $OUT"
