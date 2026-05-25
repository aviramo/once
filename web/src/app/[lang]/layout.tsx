import type { Metadata } from "next";
import { IBM_Plex_Sans_Hebrew } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, locales, type Locale } from "@/i18n/locales";
import "../globals.css";

// IBM Plex Sans Hebrew — a precise, engineered face suited to a dense
// operations console. The static marketing site at /index.html (served by
// the middleware for signed-out visitors at `/`) ships its own typography
// and never reaches this layout; everything Next renders here is the panel.
const panelFont = IBM_Plex_Sans_Hebrew({
  variable: "--font-sans",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "once",
  description: "פגישה אחת כל פעם",
};

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const dir = (lang as Locale) === "he" ? "rtl" : "ltr";

  return (
    <html lang={lang} dir={dir} className={`${panelFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
