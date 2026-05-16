"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// The middleware rewrites /admin/areas → /[lang]/admin/areas, so this is the
// route segment to revalidate after every mutation.
const AREAS_PATH = "/[lang]/admin/areas";

// 3-state area mode (source of truth in the DB). `enabled` is still written,
// mirrored as (mode !== 'disabled'), only for the transitional read-compat
// window — see BACKWARD_COMPAT.md.
export type AreaMode = "active" | "scheduled" | "disabled";
const MODES: readonly AreaMode[] = ["active", "scheduled", "disabled"];

function parseMode(raw: unknown): AreaMode {
  const s = String(raw ?? "");
  return (MODES as readonly string[]).includes(s) ? (s as AreaMode) : "scheduled";
}

type Parsed = {
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
  starts_at: string;
  mode: AreaMode;
};

function parse(fd: FormData): Parsed {
  const label = String(fd.get("label") ?? "").trim();
  const lat = Number(fd.get("lat"));
  const lng = Number(fd.get("lng"));
  const radius_m = Math.round(Number(fd.get("radius_m")));
  const startsRaw = String(fd.get("starts_at") ?? "").trim();
  // datetime-local has no timezone; treat it as the admin's local time and
  // normalise to ISO. Empty → "now" (only meaningful for scheduled mode).
  const starts_at = startsRaw
    ? new Date(startsRaw).toISOString()
    : new Date().toISOString();
  return { label, lat, lng, radius_m, starts_at, mode: parseMode(fd.get("mode")) };
}

function invalid(p: Parsed): string | null {
  if (!p.label) return "missing_label";
  if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90) return "bad_lat";
  if (!Number.isFinite(p.lng) || p.lng < -180 || p.lng > 180) return "bad_lng";
  if (!Number.isFinite(p.radius_m) || p.radius_m <= 0) return "bad_radius";
  return null;
}

// EWKT — geography input accepts SRID=4326;POINT(lng lat). PostgREST casts the
// JSON string straight into the geography column (verified round-trip).
const ewkt = (lng: number, lat: number) => `SRID=4326;POINT(${lng} ${lat})`;

export async function createArea(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const p = parse(fd);
  const bad = invalid(p);
  if (bad) throw new Error(bad);
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("areas").insert({
    label: p.label,
    center: ewkt(p.lng, p.lat),
    radius_m: p.radius_m,
    starts_at: p.starts_at,
    mode: p.mode,
    enabled: p.mode !== "disabled",
  });
  if (error) throw new Error(error.message);
  revalidatePath(AREAS_PATH, "page");
}

export async function updateArea(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("missing_id");
  const p = parse(fd);
  const bad = invalid(p);
  if (bad) throw new Error(bad);
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("areas")
    .update({
      label: p.label,
      center: ewkt(p.lng, p.lat),
      radius_m: p.radius_m,
      starts_at: p.starts_at,
      mode: p.mode,
      enabled: p.mode !== "disabled",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(AREAS_PATH, "page");
}

export async function deleteArea(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("missing_id");
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("areas").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(AREAS_PATH, "page");
}

// Quick mode switch from a row (the 3 buttons הפעלה / תזמון / מושבת).
export async function setAreaMode(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("missing_id");
  const mode = parseMode(fd.get("mode"));
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("areas")
    .update({ mode, enabled: mode !== "disabled" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(AREAS_PATH, "page");
}
