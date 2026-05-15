import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { SignOutButton } from "./_components/SignOutButton";
import { SearchControls } from "./_components/SearchControls";
import { UserCard, type UserRow } from "./_components/UserCard";

const P1_VALUES = ["free", "watching", "waiting", "chat", "locked"] as const;
const P2_VALUES = ["free", "pending", "chat", "locked"] as const;

export default async function AdminDashboard({
  params,
  searchParams,
}: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const p1Raw = typeof sp.p1 === "string" ? sp.p1 : "";
  const p2Raw = typeof sp.p2 === "string" ? sp.p2 : "";
  const p1 = (P1_VALUES as readonly string[]).includes(p1Raw) ? p1Raw : "";
  const p2 = (P2_VALUES as readonly string[]).includes(p2Raw) ? p2Raw : "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const isAdmin =
    (user.app_metadata as { role?: string } | undefined)?.role === "admin";

  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_admin");
  }

  const admin = createSupabaseAdmin();
  let usersQuery = admin
    .from("users")
    .select("user_id, name, created_at, last_seen, data, relations")
    .order("last_seen", { ascending: false, nullsFirst: false })
    .limit(100);
  if (q) usersQuery = usersQuery.ilike("name", `%${q}%`);
  if (p1) usersQuery = usersQuery.eq("relations->page1->>state", p1);
  if (p2) usersQuery = usersQuery.eq("relations->page2->>state", p2);
  const { data: users } = await usersQuery;
  const rows = (users ?? []) as UserRow[];

  const { data: me } = await admin
    .from("users")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold">{dict.admin.dashboardTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dict.admin.loggedInAs}: {me?.name ?? user.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {locale === "he" ? "← לאתר" : "← Site"}
          </Link>
          <SignOutButton label={dict.admin.signOut} />
        </div>
      </header>

      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold">{dict.admin.users}</h2>
          <span className="text-sm text-muted-foreground">{rows.length}</span>
        </div>
        <div className="mt-4">
          <SearchControls
            searchPlaceholder={dict.admin.search}
            p1Label={dict.admin.filterP1}
            p2Label={dict.admin.filterP2}
            anyLabel={dict.admin.filterAny}
            p1States={P1_VALUES.map((v) => ({
              value: v,
              label: (dict.admin.page1States as Record<string, string>)[v],
            }))}
            p2States={P2_VALUES.map((v) => ({
              value: v,
              label: (dict.admin.page2States as Record<string, string>)[v],
            }))}
          />
          {rows.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {dict.admin.noResults}
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) => (
                <UserCard
                  key={r.user_id}
                  row={r}
                  dict={dict.admin}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
