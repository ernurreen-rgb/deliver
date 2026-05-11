import Link from "next/link";
import { appConfig, appRoutes } from "@/config/app";
import { hasAnyRole } from "@/domains/auth/authorization";
import { getCurrentUser } from "@/domains/auth/session";

type NavItem = {
  href: (typeof appRoutes)[keyof typeof appRoutes];
  label: string;
};

const publicNavItems: NavItem[] = [
  { href: appRoutes.customer, label: "Клиент" },
  { href: appRoutes.cart, label: "Корзина" },
];

export async function AppHeader() {
  const user = await getCurrentUser();
  const navItems = [...publicNavItems];

  if (user) {
    navItems.push({ href: appRoutes.account, label: "Профиль" });
  } else {
    navItems.push({ href: appRoutes.login, label: "Войти" });
  }

  if (hasAnyRole(user, ["restaurant_staff", "admin"])) {
    navItems.push({ href: appRoutes.restaurant, label: "Ресторан" });
  }

  if (hasAnyRole(user, ["courier", "admin"])) {
    navItems.push({ href: appRoutes.courier, label: "Курьер" });
  }

  if (hasAnyRole(user, ["operator", "admin"])) {
    navItems.push({ href: appRoutes.operator, label: "Оператор" });
  }

  if (hasAnyRole(user, ["admin"])) {
    navItems.push({ href: appRoutes.admin, label: "Админ" });
  }

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href={appRoutes.customer} className="flex items-baseline gap-3">
          <span className="text-xl font-semibold tracking-normal">
            {appConfig.name}
          </span>
          <span className="text-sm text-foreground/60">{appConfig.city}</span>
        </Link>
        <nav className="flex flex-wrap gap-2 text-sm">
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
      </div>
    </header>
  );
}
