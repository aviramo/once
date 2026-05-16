import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell, Section, Card, EmptyState } from "../_components/ui";
import { Disclosure } from "../_components/Disclosure";
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
            <div className="space-y-3">
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
        </div>
      </Section>
    </AdminShell>
  );
}
