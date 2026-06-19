import type { UserRole } from "@/types/domain";
import type { PlatformSurfaceId } from "@/platform/app-boundaries";

export type AppShellSurfaceId = Exclude<PlatformSurfaceId, "api">;

export type SurfaceNavItem = {
  href: string;
  label: string;
  showWhen?: "always" | "authenticated" | "anonymous";
  roles?: readonly UserRole[];
};

export type SurfaceShellConfig = {
  label: string;
  homeHref: string;
  navItems: readonly SurfaceNavItem[];
};

export const surfaceShells = {
  customer: {
    label: "Клиент",
    homeHref: "/",
    navItems: [
      { href: "/", label: "Рестораны" },
      { href: "/cart", label: "Корзина" },
      { href: "/orders", label: "Заказы", showWhen: "authenticated" },
      { href: "/account", label: "Профиль", showWhen: "authenticated" },
      { href: "/login", label: "Войти", showWhen: "anonymous" },
    ],
  },
  restaurant: {
    label: "Ресторан",
    homeHref: "/restaurant",
    navItems: [
      { href: "/restaurant", label: "Заказы" },
      { href: "/restaurant/menu", label: "Меню" },
      { href: "/restaurant/settings", label: "Настройки" },
    ],
  },
  courier: {
    label: "Курьер",
    homeHref: "/courier",
    navItems: [{ href: "/courier", label: "Доставка" }],
  },
  operator: {
    label: "Оператор",
    homeHref: "/operator",
    navItems: [
      { href: "/operator", label: "Диспетчерская" },
      { href: "/operator/couriers", label: "Курьеры" },
      { href: "/operator/pilot", label: "Пилот" },
    ],
  },
  admin: {
    label: "Админ",
    homeHref: "/admin",
    navItems: [
      { href: "/admin", label: "Обзор" },
      { href: "/admin/restaurants", label: "Рестораны" },
    ],
  },
} as const satisfies Record<AppShellSurfaceId, SurfaceShellConfig>;

export function getSurfaceShell(surface: AppShellSurfaceId) {
  return surfaceShells[surface];
}
