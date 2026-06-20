import { RoleShell } from "@/components/layout/role-shell";

export default function OperatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RoleShell surface="operator">{children}</RoleShell>;
}
