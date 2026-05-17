// Single source of truth for the area mode union. Pure type (no runtime, no
// "use client"/"server-only"), so it is safely shared by the geo helpers, the
// AreaForm client component, and the server actions — none of which should
// re-declare this enum independently.
export type AreaMode = "active" | "scheduled" | "disabled";
