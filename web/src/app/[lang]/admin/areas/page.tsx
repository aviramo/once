import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell, Section, Card, EmptyState } from "../_components/ui";
import { Disclosure } from "../_components/Disclosure";
import { AreaForm, type AreaMode } from "./_components/AreaForm";
import { AreasBoard } from "./_components/AreasBoard";
import { createArea, updateArea, deleteArea, setAreaMode } from "./actions";

type AreaListRow = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
  starts_at: string;
  mode: AreaMode;
};

const AREA_MODES = ["active", "scheduled", "disabled"] as const;

export default async function AreasPage({
  params,
  searchParams,
}: PageProps<"/[lang]/admin/areas">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const a = dict.admin.areas;
  const sp = await searchParams;
  const mode =
    typeof sp.mode === "string" &&
    (AREA_MODES as readonly string[]).includes(sp.mode)
      ? (sp.mode as AreaMode)
      : "";

  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  const admin = createSupabaseAdmin();
  let areasQ = admin
    .from("areas_list")
    .select("id, label, lat, lng, radius_m, starts_at, mode")
    .order("created_at", { ascending: false });
  // ?mode= deep-link from the dashboard catalog tiles → the matching subset
  // (board + map both reflect it; the Areas nav tab returns to the full set).
  if (mode) areasQ = areasQ.eq("mode", mode);
  const { data } = await areasQ;
  const areas = (data ?? []) as AreaListRow[];

  const formDict = {
    label: a.label,
    search: a.search,
    searching: a.searching,
    noResults: a.noResults,
    radius: a.radius,
    startsAt: a.startsAt,
    save: a.save,
    cancel: a.cancel,
    add: a.add,
    mapUnavailable: a.mapUnavailable,
    mapHint: a.mapHint,
  };
  const rowDict = {
    edit: a.edit,
    delete: a.delete,
    modeActive: a.modeActive,
    modeScheduled: a.modeScheduled,
    modeDisabled: a.modeDisabled,
    menu: a.menu,
    statusActive: a.statusActive,
    statusWaiting: a.statusWaiting,
    statusDisabled: a.statusDisabled,
    confirmDelete: a.confirmDelete,
    form: formDict,
  };
  const mapDict = {
    mapUnavailable: a.mapUnavailable,
    mapHint: a.mapHint,
    statusActive: a.statusActive,
    statusWaiting: a.statusWaiting,
    statusDisabled: a.statusDisabled,
    zoomIn: a.zoomIn,
    zoomOut: a.zoomOut,
    fit: a.fit,
  };

  return (
    <AdminShell dict={dict.admin} active="areas">
      <Section title={a.title} count={areas.length} hint={a.subtitle}>
        <div className="space-y-6">
          <Card>
            <Disclosure label={a.add} tone="button">
              <AreaForm action={createArea} dict={formDict} lang={locale} />
            </Disclosure>
          </Card>

          {areas.length === 0 ? (
            <EmptyState>{a.none}</EmptyState>
          ) : (
            <AreasBoard
              areas={areas}
              rowDict={rowDict}
              mapDict={mapDict}
              lang={locale}
              updateAction={updateArea}
              deleteAction={deleteArea}
              setModeAction={setAreaMode}
            />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
