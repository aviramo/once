import { IBM_Plex_Sans_Hebrew } from "next/font/google";

/**
 * The admin panel runs its own typeface — IBM Plex Sans Hebrew, a precise,
 * engineered face suited to a dense operations console — without touching the
 * public site's font. Re-declaring `--font-sans` on this subtree (and applying
 * `font-sans` here so the property is recomputed) overrides the root layout's
 * Heebo for everything under `/admin`. Each admin page still owns its own
 * chrome: authenticated pages wrap themselves in <AdminShell>, the login page
 * centres its own card.
 */
const adminFont = IBM_Plex_Sans_Hebrew({
  variable: "--font-sans",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function AdminLayout({
  children,
}: LayoutProps<"/[lang]/admin">) {
  return <div className={`${adminFont.variable} font-sans`}>{children}</div>;
}
