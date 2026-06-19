import Link from "next/link";
import { appConfig } from "@/config/app";
import { logoutAction } from "@/domains/auth/actions";
import { hasAnyRole } from "@/domains/auth/authorization";
import { getCurrentUser } from "@/domains/auth/session";
import {
  getSurfaceShell,
  type AppShellSurfaceId,
  type SurfaceNavItem,
} from "@/platform/navigation";

function canShowNavItem(
  item: SurfaceNavItem,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
) {
  if (item.showWhen === "authenticated" && !user) {
    return false;
  }

  if (item.showWhen === "anonymous" && user) {
    return false;
  }

  if (item.roles && !hasAnyRole(user, item.roles)) {
    return false;
  }

  return true;
}

function formatUserRoleLabel(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
) {
  if (!user) {
    return "";
  }

  return user.roles.map((assignment) => assignment.role).join(", ");
}

export async function AppHeader({
  surface,
}: {
  surface: AppShellSurfaceId;
}) {
  const user = await getCurrentUser();
  const shell = getSurfaceShell(surface);
  const navItems = shell.navItems.filter((item) => canShowNavItem(item, user));
  const accountRoleLabel = formatUserRoleLabel(user);

  return (
    <header className="border-b border-border bg-surface" data-surface={surface}>
      <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href={shell.homeHref} className="flex items-baseline gap-3">
          <span className="text-xl font-semibold tracking-normal">
            {appConfig.name}
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground/60">
            {shell.label}
          </span>
          <span className="text-sm text-foreground/60">{appConfig.city}</span>
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border border-border px-3 py-2 text-foreground/75 transition-colors hover:border-accent hover:text-accent"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {user ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-surface-muted px-3 py-2 text-xs font-medium text-foreground/65">
                {user.phone} · {accountRoleLabel}
              </span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:border-warning hover:text-warning"
                >
                  Выйти
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
