import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, locales, type Locale } from "@/i18n/locales";
import "../globals.css";

const heebo = Heebo({
  variable: "--font-sans",
  subsets: ["hebrew", "latin"],
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
    <html lang={lang} dir={dir} className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
