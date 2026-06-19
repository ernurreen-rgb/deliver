import { RoleShell } from "@/components/layout/role-shell";

export default function RestaurantLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RoleShell surface="restaurant">{children}</RoleShell>;
}
