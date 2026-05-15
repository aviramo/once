export default function AdminLayout({
  children,
}: LayoutProps<"/[lang]/admin">) {
  return <div className="min-h-screen flex-1 bg-muted/30">{children}</div>;
}
