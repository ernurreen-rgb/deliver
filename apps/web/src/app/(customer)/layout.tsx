import { RoleShell } from "@/components/layout/role-shell";

export default function CustomerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RoleShell surface="customer">{children}</RoleShell>;
}
