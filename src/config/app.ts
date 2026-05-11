export const appConfig = {
  name: "Deliver",
  city: "Алматы",
  defaultLocale: "ru",
  supportedLocales: ["ru", "kk"],
} as const;

export const appRoutes = {
  customer: "/",
  login: "/login",
  account: "/account",
  cart: "/cart",
  restaurant: "/restaurant",
  courier: "/courier",
  operator: "/operator",
  admin: "/admin",
} as const;
