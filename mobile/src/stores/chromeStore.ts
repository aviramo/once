import { create } from 'zustand'

// Global status-bar appearance signal.
//
// Most of the app wears WHITE glyphs over the purple StatusBarBand: over a
// photo or the beige page the band supplies the contrast the glyphs need. A few
// full-screen BEIGE sheets (the Communities hub) look wrong under that purple
// wash — the user wants their top to read as the plain page background. Those
// want the opposite: a flat beige top, DARK glyphs, and NO band.
//
// The sheet lives inside the /home route, but the band and the status-bar style
// are global (root layout), so the sheet can't override them locally. It raises
// this flag instead; the root layout (and home's own AppStatusBar) read it and
// flip to dark-glyphs / no-band while it's set.
type ChromeState = {
  beigeTop: boolean
  setBeigeTop: (v: boolean) => void
}

export const useChrome = create<ChromeState>((set) => ({
  beigeTop: false,
  setBeigeTop: (beigeTop) => set({ beigeTop }),
}))
