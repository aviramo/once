"use client";

import { useEffect, useRef, useState, useTransition } from "react";

export type AreaMode = "active" | "scheduled" | "disabled";

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
  lat: string;
  lng: string;
  coordsHint: string;
  save: string;
  cancel: string;
  add: string;
  modeLabel: string;
  modeActive: string;
  modeScheduled: string;
  modeDisabled: string;
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
  const [label, setLabel] = useState(initial?.label ?? "");
  const [lat, setLat] = useState(initial ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial ? String(initial.lng) : "");
  const [radius, setRadius] = useState(
    initial ? String(initial.radius_m) : "1000",
  );
  const [startsAt, setStartsAt] = useState(
    initial ? toLocalInput(initial.starts_at) : "",
  );
  const [mode, setMode] = useState<AreaMode>(initial?.mode ?? "scheduled");

  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching, setSearching] = useState(false);
  const tokenRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const [pending, startTransition] = useTransition();

  // Debounced autocomplete via the server proxy. All state writes happen
  // inside the (asynchronous) debounce callback, never synchronously in the
  // effect body — the dropdown's visibility is gated on the live query length
  // (`canSearch` below) so there's nothing to clear synchronously. Aborts
  // in-flight requests so a slow response never lands over a newer query.
  useEffect(() => {
    const q = query.trim();
    abortRef.current?.abort();
    if (q.length < 2) return;
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
  }, [query, lang]);

  const canSearch = query.trim().length >= 2;

  async function pickPrediction(p: Prediction) {
    setQuery("");
    setPredictions([]);
    try {
      const u = new URL("/api/places", window.location.origin);
      u.searchParams.set("place_id", p.place_id);
      u.searchParams.set("token", tokenRef.current);
      u.searchParams.set("lang", lang);
      const res = await fetch(u.toString());
      const j = await res.json();
      tokenRef.current = ""; // details call closes the billing session
      if (typeof j.lat === "number" && typeof j.lng === "number") {
        setLat(String(j.lat));
        setLng(String(j.lng));
        if (!label.trim()) setLabel(j.label || p.description);
        else if (j.label) setLabel(j.label);
      }
    } catch {
      /* keep manual entry */
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(fd);
      if (!isEdit) {
        setLabel("");
        setLat("");
        setLng("");
        setRadius("1000");
        setStartsAt("");
        setMode("scheduled");
        setQuery("");
        setPredictions([]);
      }
      onDone?.();
    });
  }

  const field =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {isEdit && <input type="hidden" name="id" value={initial!.id} />}
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />

      <div className="relative">
        <input
          type="search"
          placeholder={dict.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={field}
          autoComplete="off"
        />
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

      {/* Selected-location tag: the chosen place name, editable. Re-search
          above to replace it (that also moves the map + coordinates). */}
      <label className="block text-sm">
        <span className="text-muted-foreground">{dict.label}</span>
        <div className="mt-1 flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5">
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
            required
            placeholder={dict.search}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </label>

      {/* Map preview: marker + radius circle, server-proxied (no browser
          key). The img hides itself if the key lacks Maps Static API; the
          coordinates caption below always shows so the area is still
          verifiable. */}
      {lat && lng ? (
        <div className="overflow-hidden rounded-xl border border-border">
          {/* Server-proxied dynamic endpoint, not a static asset — next/image
              would need a custom loader for no real benefit in an admin tool. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${lat},${lng},${radius}`}
            src={`/api/staticmap?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&r=${encodeURIComponent(radius || "0")}&lang=${encodeURIComponent(lang)}`}
            alt={label || `${lat}, ${lng}`}
            className="block h-44 w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {dict.coordsHint}
        {lat && lng ? ` (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)})` : ""}
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {dict.lat} / {dict.lng}
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-muted-foreground">{dict.lat}</span>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              required
              className={`mt-1 ${field}`}
            />
          </label>
          <label className="block">
            <span className="text-muted-foreground">{dict.lng}</span>
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              inputMode="decimal"
              required
              className={`mt-1 ${field}`}
            />
          </label>
        </div>
      </details>

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
            name="starts_at"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            type="datetime-local"
            className={`mt-1 ${field}`}
          />
        </label>
      </div>

      <fieldset className="text-sm">
        <legend className="text-muted-foreground">{dict.modeLabel}</legend>
        <div className="mt-1 flex gap-2">
          {(
            [
              ["active", dict.modeActive],
              ["scheduled", dict.modeScheduled],
              ["disabled", dict.modeDisabled],
            ] as [AreaMode, string][]
          ).map(([value, text]) => (
            <label
              key={value}
              className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-center transition-colors ${
                mode === value
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/60"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="sr-only"
              />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

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
