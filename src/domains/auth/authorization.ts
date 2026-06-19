import { redirect } from "next/navigation";
import type { UserRole } from "@/types/domain";
import { buildLoginPath, sanitizeAuthRedirectPath } from "@/domains/auth/redirects";
import { getCurrentUser } from "@/domains/auth/session";

type RoleCarrier = {
  roles: Array<{ role: string }>;
} | null;

export function hasAnyRole(user: RoleCarrier, allowedRoles: readonly UserRole[]) {
  if (!user) {
    return false;
  }

  const allowed = new Set<string>(allowedRoles);

  return user.roles.some((assignment) => allowed.has(assignment.role));
}

export async function requireAnyRole(
  allowedRoles: readonly UserRole[],
  options?: {
    redirectPath?: string;
  },
) {
  const user = await getCurrentUser();

  if (!user) {
    if (options?.redirectPath) {
      redirect(
        buildLoginPath({
          nextPath: sanitizeAuthRedirectPath(options.redirectPath),
        }),
      );
    }

    redirect("/login");
  }

  if (!hasAnyRole(user, allowedRoles)) {
    redirect("/");
  }

  return user;
}
