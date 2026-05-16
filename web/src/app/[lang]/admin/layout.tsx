export default function AdminLayout({
  children,
}: LayoutProps<"/[lang]/admin">) {
  // Each admin page owns its own chrome: the authenticated pages wrap
  // themselves in <AdminShell>, the login page centres its own card. The
  // layout stays a passthrough so there's a single source of the shell.
  return children;
}
