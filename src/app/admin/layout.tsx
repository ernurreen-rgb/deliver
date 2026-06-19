import { RoleShell } from "@/components/layout/role-shell";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RoleShell surface="admin">{children}</RoleShell>;
}
