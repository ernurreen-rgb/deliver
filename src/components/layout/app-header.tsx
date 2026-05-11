import Link from "next/link";
import { appConfig, appRoutes } from "@/config/app";

const navItems = [
  { href: appRoutes.customer, label: "Клиент" },
  { href: appRoutes.account, label: "Профиль" },
  { href: appRoutes.cart, label: "Корзина" },
  { href: appRoutes.restaurant, label: "Ресторан" },
  { href: appRoutes.courier, label: "Курьер" },
  { href: appRoutes.operator, label: "Оператор" },
  { href: appRoutes.admin, label: "Админ" },
];

export function AppHeader() {
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
