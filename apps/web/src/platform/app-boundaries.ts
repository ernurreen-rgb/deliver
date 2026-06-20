import type { UserRole } from "@/types/domain";

export type PlatformSurfaceId =
  | "customer"
  | "restaurant"
  | "courier"
  | "operator"
  | "admin"
  | "api";

export type PlatformSplitTargetId = PlatformSurfaceId | "worker";

export type PlatformSurface = {
  id: PlatformSurfaceId;
  label: string;
  currentAppDir: string;
  currentRoutePrefixes: readonly string[];
  futurePackage: string;
  access: "public" | "service" | readonly UserRole[];
  allowedDomains: readonly string[];
  allowedComponentGroups: readonly string[];
};

export const platformSurfaces = [
  {
    id: "customer",
    label: "Customer web",
    currentAppDir: "apps/web/src/app/(customer)",
    currentRoutePrefixes: [
      "/",
      "/account",
      "/cart",
      "/checkout",
      "/login",
      "/orders",
      "/restaurants",
    ],
    futurePackage: "apps/customer",
    access: "public",
    allowedDomains: ["auth", "cart", "geo", "orders", "restaurants", "users"],
    allowedComponentGroups: ["cart", "checkout", "geo", "layout", "orders", "shared"],
  },
  {
    id: "restaurant",
    label: "Restaurant cabinet",
    currentAppDir: "apps/web/src/app/restaurant",
    currentRoutePrefixes: ["/restaurant"],
    futurePackage: "apps/restaurant",
    // Admins still need an explicit restaurant_staff row for restaurant mutations.
    access: ["restaurant_staff", "admin"],
    allowedDomains: ["auth", "menu", "orders", "restaurants"],
    allowedComponentGroups: ["layout", "orders", "shared"],
  },
  {
    id: "courier",
    label: "Courier cabinet",
    currentAppDir: "apps/web/src/app/courier",
    currentRoutePrefixes: ["/courier"],
    futurePackage: "apps/courier",
    access: ["courier", "admin"],
    allowedDomains: ["auth", "delivery", "orders"],
    allowedComponentGroups: ["layout", "shared"],
  },
  {
    id: "operator",
    label: "Operator back-office",
    currentAppDir: "apps/web/src/app/operator",
    currentRoutePrefixes: ["/operator"],
    futurePackage: "apps/operator",
    access: ["operator", "admin"],
    allowedDomains: ["auth", "couriers", "delivery", "orders", "pilot"],
    allowedComponentGroups: ["layout", "orders", "shared"],
  },
  {
    id: "admin",
    label: "Admin back-office",
    currentAppDir: "apps/web/src/app/admin",
    currentRoutePrefixes: ["/admin"],
    futurePackage: "apps/admin",
    access: ["admin"],
    allowedDomains: ["admin", "auth", "geo"],
    allowedComponentGroups: ["geo", "layout", "shared"],
  },
  {
    id: "api",
    label: "Backend API",
    currentAppDir: "apps/web/src/app/api",
    currentRoutePrefixes: ["/api"],
    futurePackage: "apps/api",
    access: "service",
    allowedDomains: ["auth", "delivery", "geo"],
    allowedComponentGroups: [],
  },
] as const satisfies readonly PlatformSurface[];

export const platformSplitTargets = [
  ...platformSurfaces.map((surface) => ({
    id: surface.id,
    currentDir: surface.currentAppDir,
    futurePackage: surface.futurePackage,
  })),
  {
    id: "worker",
    currentDir: "apps/web/src/workers",
    futurePackage: "apps/worker",
  },
] as const satisfies readonly {
  id: PlatformSplitTargetId;
  currentDir: string;
  futurePackage: string;
}[];

export function getPlatformSurfaceByAppPath(pathname: string) {
  const normalizedPath = pathname.replaceAll("\\", "/");

  return platformSurfaces.find((surface) =>
    normalizedPath.startsWith(`${surface.currentAppDir}/`),
  );
}
