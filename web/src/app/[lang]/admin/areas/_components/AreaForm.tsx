"use client";

import { useEffect, useRef, useState, useTransition } from "react";

// Re-exported so existing `./AreaForm` importers don't churn; the single
// definition lives in the shared, runtime-free areaMode module.
export type { AreaMode } from "../../_components/areaMode";
import type { AreaMode } from "../../_components/areaMode";

export type AreaInitial = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
  starts_at: string;
  mode: AreaMode;
};

type Dict = {
  label: string;
  search: string;
  searching: string;
  noResults: string;
  radius: string;
  startsAt: string;
  save: string;
  cancel: string;
  add: string;
  mapUnavailable: string;
  mapHint: string;
};

type Prediction = { place_id: string; description: string };

// Cheap session token (autocomplete keystrokes + the closing details call are
// billed by Google as one session when they share a token).
function sessionToken(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ISO → value for <input type="datetime-local"> in the admin's local time.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Map preview as its own component so the `key={lat,lng,radius}` remount gives
// a fresh error state per location (no setState-in-effect to reset it). On any
// staticmap failure (key lacks Maps Static API, upstream error) the <img>
// onError flips to an explanatory placeholder instead of a silent empty box.
function MapPreview({
  lat,
  lng,
  radius,
  lang,
  label,
  dict,
}: {
  lat: string;
  lng: string;
  radius: string;
  lang: string;
  label: string;
  dict: Dict;
}) {
  const [errored, setErrored] = useState(false);
  // 4:3 landscape, centred and width-capped — bigger than the old thin strip
  // without dominating the form on wide screens.
  const frame = "mx-auto w-full max-w-xl aspect-[4/3]";
  if (errored) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/30 px-4 text-center ${frame}`}
      >
        <span className="text-sm font-medium text-foreground">
          {dict.mapUnavailable}
        </span>
        <span className="text-xs text-muted-foreground">{dict.mapHint}</span>
      </div>
    );
  }
  return (
    <div className={`overflow-hidden rounded-xl border border-border ${frame}`}>
      {/* Server-proxied dynamic endpoint, not a static asset — next/image
          would need a custom loader for no real benefit in an admin tool. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/staticmap?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&r=${encodeURIComponent(radius || "0")}&lang=${encodeURIComponent(lang)}`}
        alt={label || `${lat}, ${lng}`}
        className="block size-full object-cover"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

export function AreaForm({
  action,
  initial,
  dict,
  lang,
  onDone,
}: {
  action: (fd: FormData) => Promise<void>;
  initial?: AreaInitial;
  dict: Dict;
  lang: string;
  onDone?: () => void;
}) {
  const isEdit = !!initial;
  // `label` is the single source of truth: it is BOTH the search box and the
  // selected place name. Typing in it drives Google autocomplete; picking a
  // result fills it (+ lat/lng); it stays freely editable afterwards.
  const [label, setLabel] = useState(initial?.label ?? "");
  const [lat, setLat] = useState(initial ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial ? String(initial.lng) : "");
  const [radius, setRadius] = useState(
    initial ? String(initial.radius_m) : "1000",
  );
  const [startsAt, setStartsAt] = useState(
    initial ? toLocalInput(initial.starts_at) : "",
  );
  // Mode is no longer chosen here — it is switched from the list's kebab menu.
  // On create the default follows the start time (a time set ⇒ scheduled,
  // none ⇒ disabled); on edit we preserve whatever the area already is.
  const mode: AreaMode = isEdit
    ? initial!.mode
    : startsAt
      ? "scheduled"
      : "disabled";

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const tokenRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);
  // The last value committed by a pick (or the initial value). While `label`
  // equals it we don't re-search — so selecting a result, or opening an
  // existing area for edit, doesn't immediately reopen the dropdown. State
  // (not a ref) because `canSearch` reads it during render.
  const [committed, setCommitted] = useState(initial?.label ?? "");
  const [pending, startTransition] = useTransition();

  // Debounced autocomplete via the server proxy. State writes happen only
  // inside the (asynchronous) debounce callback, never synchronously in the
  // effect body — dropdown visibility is gated on `canSearch` in render so
  // there's nothing to clear synchronously (keeps react-hooks/set-state-in-
  // effect green). Aborts in-flight requests so a slow response never lands
  // over a newer query.
  useEffect(() => {
    const q = label.trim();
    abortRef.current?.abort();
    if (!focused || q.length < 2 || q === committed) return;
    if (!tokenRef.current) tokenRef.current = sessionToken();
    const handle = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      setPredictions([]);
      try {
        const u = new URL("/api/places", window.location.origin);
        u.searchParams.set("q", q);
        u.searchParams.set("token", tokenRef.current);
        u.searchParams.set("lang", lang);
        const res = await fetch(u.toString(), { signal: ctrl.signal });
        const j = await res.json();
        if (ctrl.signal.aborted) return;
        setPredictions(Array.isArray(j.predictions) ? j.predictions : []);
      } catch {
        /* aborted or network — leave list as-is */
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [label, lang, focused, committed]);

  const canSearch =
    focused && label.trim().length >= 2 && label.trim() !== committed;

  async function pickPrediction(p: Prediction) {
    setPredictions([]);
    try {
      const u = new URL("/api/places", window.location.origin);
      u.searchParams.set("place_id", p.place_id);
      u.searchParams.set("token", tokenRef.current);
      u.searchParams.set("lang", lang);
      const res = await fetch(u.toString());
      const j = await res.json();
      tokenRef.current = ""; // details call closes the billing session
      const picked =
        typeof j.label === "string" && j.label ? j.label : p.description;
      setCommitted(picked);
      setLabel(picked);
      if (typeof j.lat === "number" && typeof j.lng === "number") {
        setLat(String(j.lat));
        setLng(String(j.lng));
      }
    } catch {
      /* keep manual entry */
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Coordinates come only from picking a search result now (the manual
    // lat/lng inputs were removed). Without a pick there is nothing to save —
    // the server would reject it anyway, so block the submit silently.
    if (!lat || !lng) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(fd);
      if (!isEdit) {
        setLabel("");
        setLat("");
        setLng("");
        setRadius("1000");
        setStartsAt("");
        setPredictions([]);
        setCommitted("");
      }
      onDone?.();
    });
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  // Convert the admin's local datetime-local value to UTC ISO *here in the
  // browser* (where local time is reliably the admin's), not in the server
  // action (Vercel runs in UTC — converting there shifts scheduled launches
  // by the admin's offset). actions.ts treats this as already-ISO.
  const startsAtIso = startsAt ? new Date(startsAt).toISOString() : "";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
      <input type="hidden" name="starts_at" value={startsAtIso} />
      <input type="hidden" name="mode" value={mode} />

      {/* Single field: search + selected location in one. Type to search
          Google; pick a result to fill it (+ coordinates + map); stays
          editable. Re-typing reopens the dropdown. */}
      <label className="block text-sm">
        <span className="text-muted-foreground">{dict.label}</span>
        <div className="relative mt-1">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:border-primary">
            <svg
              viewBox="0 0 24 24"
              className="size-4 shrink-0 text-primary"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
            </svg>
            <input
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onFocus={() => setFocused(true)}
              // Delay so a prediction click registers before the blur hides
              // the dropdown (the buttons also preventDefault on mousedown).
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              required
              placeholder={dict.search}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          {canSearch && (searching || predictions.length > 0) && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-background shadow-lg">
              {searching && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {dict.searching}
                </div>
              )}
              {!searching &&
                predictions.map((p) => (
                  <button
                    key={p.place_id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickPrediction(p)}
                    className="block w-full px-3 py-2 text-start text-sm hover:bg-muted"
                  >
                    {p.description}
                  </button>
                ))}
              {!searching && predictions.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {dict.noResults}
                </div>
              )}
            </div>
          )}
        </div>
      </label>

      {lat && lng ? (
        <MapPreview
          key={`${lat},${lng},${radius}`}
          lat={lat}
          lng={lng}
          radius={radius}
          lang={lang}
          label={label}
          dict={dict}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">{dict.radius}</span>
          <input
            name="radius_m"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            type="number"
            min={1}
            required
            className={`mt-1 ${field}`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">{dict.startsAt}</span>
          <input
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            type="datetime-local"
            className={`mt-1 ${field}`}
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "…" : isEdit ? dict.save : dict.add}
        </button>
        {isEdit && onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            {dict.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
