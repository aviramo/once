import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { SignOutButton } from "../_components/SignOutButton";
import { AreaForm } from "./_components/AreaForm";
import { AreaRow } from "./_components/AreaRow";
import { createArea, updateArea, deleteArea, toggleArea } from "./actions";

type AreaListRow = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
  starts_at: string;
  enabled: boolean;
};

export default async function AreasPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const a = dict.admin.areas;

  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("areas_list")
    .select("id, label, lat, lng, radius_m, starts_at, enabled")
    .order("created_at", { ascending: false });
  const areas = (data ?? []) as AreaListRow[];

  // dict slices handed to the client components (kept narrow so the form /
  // row only see what they render).
  const formDict = {
    label: a.label,
    search: a.search,
    searching: a.searching,
    noResults: a.noResults,
    radius: a.radius,
    startsAt: a.startsAt,
    lat: a.lat,
    lng: a.lng,
    coordsHint: a.coordsHint,
    save: a.save,
    cancel: a.cancel,
    add: a.add,
    enabledField: a.enabledField,
  };
  const rowDict = {
    edit: a.edit,
    delete: a.delete,
    enable: a.enable,
    disable: a.disable,
    enabled: a.enabled,
    disabled: a.disabled,
    startsNow: a.startsNow,
    startsFuture: a.startsFuture,
    confirmDelete: a.confirmDelete,
    form: formDict,
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold">{a.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {a.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {dict.admin.back}
          </Link>
          <SignOutButton label={dict.admin.signOut} />
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{a.add}</h2>
        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <AreaForm action={createArea} dict={formDict} lang={locale} />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold">{a.title}</h2>
          <span className="text-sm text-muted-foreground">{areas.length}</span>
        </div>
        {areas.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {a.none}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {areas.map((area) => (
              <AreaRow
                key={area.id}
                area={area}
                dict={rowDict}
                lang={locale}
                updateAction={updateArea}
                deleteAction={deleteArea}
                toggleAction={toggleArea}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
