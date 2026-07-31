// How many photos a profile may hold, and how many it MUST hold.
//
// MIN_PHOTOS is the whole definition of a built profile (user directive
// 2026-07-31): two photos and nothing else — an empty bio is fine. The grid,
// the picker limit, the onboarding CTA gate, the delete gate on the preview
// AND selectProfileBuilt all read these, which is why they live in lib/ rather
// than on PhotoEditor: the store may not import a component. The server states
// the same number twice more (profileComplete in supabase/functions/app, and
// the only_available image filter inside others()) — keep all three in step.

export const MAX_PHOTOS = 6
export const MIN_PHOTOS = 2
