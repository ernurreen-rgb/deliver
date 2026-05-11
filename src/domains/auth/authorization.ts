import { redirect } from "next/navigation";
import type { UserRole } from "@/types/domain";
import { getCurrentUser } from "@/domains/auth/session";

type RoleCarrier = {
  roles: Array<{ role: string }>;
} | null;

export function hasAnyRole(user: RoleCarrier, allowedRoles: UserRole[]) {
  if (!user) {
    return false;
  }

  const allowed = new Set<string>(allowedRoles);

  return user.roles.some((assignment) => allowed.has(assignment.role));
}

export async function requireAnyRole(allowedRoles: UserRole[]) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!hasAnyRole(user, allowedRoles)) {
    redirect("/");
  }

  return user;
}
