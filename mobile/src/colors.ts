export const TEXT         = '#111'
export const WHITE        = '#fff'
export const BLACK        = '#000'

// ── Brand green — large circle in the Livo icon ───────────────────────────
export const GREEN        = '#1AC944'
export const GREEN_LIGHT  = '#6DF08D'
export const GREEN_PRESS  = '#15A838'
export const GREEN_BG     = 'rgba(26,201,68,0.10)'

// ── Brand gray — small circle in the Livo icon ────────────────────────────
// Full scale derived from the icon's gray (#767676):
//   50  very light — dividers, card backgrounds
//   100 light      — pressed states on light surfaces
//   400 mid        — secondary text, soft button (MUTED_TEXT)
//   600 base       — the icon gray, soft buttons, neutral actions
//   800 dark       — pressed state for soft buttons
export const GRAY_50      = '#f4f4f4'
export const GRAY_100     = '#e8e8e8'
export const GRAY_400     = '#767676'
export const GRAY_600     = '#767676'   // icon gray — alias kept intentional
export const GRAY_800     = '#5f5f5f'

// Convenience aliases used by components
export const GRAY         = GRAY_600
export const GRAY_PRESS   = GRAY_800
export const GRAY_BG      = 'rgba(118,118,118,0.10)'

// Replaces the old opacity-based MUTED tokens — now derived from the gray scale
export const MUTED        = GRAY_50        // backgrounds, card surfaces
export const MUTED_PRESS  = GRAY_100       // pressed state on muted surfaces
export const MUTED_TEXT   = GRAY_400       // secondary / hint text

// ── Destructive red ───────────────────────────────────────────────────────
export const RED          = '#E0294A'
export const RED_PRESS    = '#C41F3B'
export const RED_BG       = 'rgba(224,41,74,0.10)'
