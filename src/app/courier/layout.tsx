import { RoleShell } from "@/components/layout/role-shell";

export default function CourierLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RoleShell surface="courier">{children}</RoleShell>;
}
