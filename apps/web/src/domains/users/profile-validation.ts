import type { Language } from "@/generated/prisma/enums";

const supportedProfileLanguages = [
  "ru",
  "kk",
] as const satisfies readonly Language[];

export function normalizeProfileName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isSupportedProfileLanguage(value: string): value is Language {
  return supportedProfileLanguages.includes(value as Language);
}
