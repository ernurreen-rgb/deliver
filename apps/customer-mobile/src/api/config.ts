import { Platform } from "react-native";

const defaultApiUrl = Platform.select({
  android: "http://10.0.2.2:3000",
  default: "http://localhost:3000",
});

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL?.trim() || defaultApiUrl
).replace(/\/$/, "");

export function resolveApiAssetUrl(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE_URL}${value.startsWith("/") ? value : `/${value}`}`;
}
