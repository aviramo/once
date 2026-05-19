import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { safeNextPath } from "@/lib/safeNext";
import { LoginForm } from "./LoginForm";

export default async function AdminLoginPage({
  params,
  searchParams,
}: PageProps<"/[lang]/admin/login">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const sp = await searchParams;
  // Where to land after sign-in (the deep-link the middleware preserved).
  // Validated to a same-origin path; falls back to the dashboard.
  const next = safeNextPath(sp.next) ?? "/admin";
  const error =
    typeof sp.error === "string"
      ? sp.error === "not_admin"
        ? dict.admin.errorNotAdmin
        : sp.error === "oauth"
          ? dict.admin.signInError
          : dict.admin.errorGeneric
      : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-sm">
        <div className="mb-6 flex items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight">Once</span>
          <span className="text-sm text-muted-foreground">
            {dict.admin.dashboardTitle}
          </span>
        </div>
        <h1 className="text-2xl font-bold">{dict.admin.loginTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {dict.admin.loginSubtitle}
        </p>
        {error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <div className="mt-6">
          <LoginForm dict={dict.admin} next={next} />
        </div>
      </div>
    </div>
  );
}
