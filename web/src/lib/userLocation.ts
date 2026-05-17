// Decode whatever the `users.location` PostGIS geography column arrives as.
// The server-side initial load reads the pre-exploded `users_map` view, but
// the live map subscribes to raw `postgres_changes` on `public.users`, where
// `location` comes through as its text representation: a little-endian EWKB
// hex point (e.g. "0101000020E6100000<8B lng><8B lat>"). EWKT and GeoJSON
// forms are tolerated too so the parser is robust to transport changes.
// Single source — nothing else parses geometry in the web app.

export type LngLat = { lat: number; lng: number };

function parseEwkbPoint(hex: string): LngLat | null {
  // 1B order + 4B type (+4B SRID) + 8B X + 8B Y → 42 hex (no SRID) or 50.
  if (hex.length < 42 || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const b = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(b)) return null;
    bytes[i] = b;
  }
  const dv = new DataView(bytes.buffer);
  const little = bytes[0] === 1;
  const type = dv.getUint32(1, little);
  if ((type & 0xff) !== 1) return null; // points only
  const hasSrid = (type & 0x20000000) !== 0;
  const off = hasSrid ? 9 : 5;
  if (bytes.length < off + 16) return null;
  const lng = dv.getFloat64(off, little);
  const lat = dv.getFloat64(off + 8, little);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function parseUserLocation(raw: unknown): LngLat | null {
  if (raw == null) return null;

  // GeoJSON Point: { type: 'Point', coordinates: [lng, lat] }.
  if (typeof raw === "object") {
    const c = (raw as { coordinates?: unknown }).coordinates;
    if (
      Array.isArray(c) &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      return { lng: c[0], lat: c[1] };
    }
    return null;
  }

  if (typeof raw !== "string") return null;
  const s = raw.trim();

  // EWKT-ish: "SRID=4326;POINT(lng lat)".
  const m = /POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i.exec(s);
  if (m) {
    const lng = Number(m[1]);
    const lat = Number(m[2]);
    return Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : null;
  }

  return /^[0-9a-fA-F]+$/.test(s) ? parseEwkbPoint(s) : null;
}
