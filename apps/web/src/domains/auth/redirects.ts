export const DEFAULT_AUTH_REDIRECT_PATH = "/account";

const MAX_AUTH_REDIRECT_PATH_LENGTH = 240;

export function sanitizeAuthRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT_PATH,
) {
  const path = typeof value === "string" ? value.trim() : "";

  if (
    !path ||
    path.length > MAX_AUTH_REDIRECT_PATH_LENGTH ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(path)
  ) {
    return fallback;
  }

  try {
    const url = new URL(path, "https://deliver.local");

    if (url.origin !== "https://deliver.local") {
      return fallback;
    }

    const normalizedPath = `${url.pathname}${url.search}${url.hash}`;

    if (normalizedPath === "/login" || normalizedPath.startsWith("/login?")) {
      return fallback;
    }

    return normalizedPath;
  } catch {
    return fallback;
  }
}

export function buildLoginPath({
  error,
  nextPath,
  phone,
  sent,
}: {
  error?: string;
  nextPath?: string;
  phone?: string;
  sent?: boolean;
}) {
  const params = new URLSearchParams();

  if (phone) {
    params.set("phone", phone);
  }

  if (sent) {
    params.set("sent", "1");
  }

  if (error) {
    params.set("error", error);
  }

  if (nextPath && nextPath !== DEFAULT_AUTH_REDIRECT_PATH) {
    params.set("next", nextPath);
  }

  const search = params.toString();
  return search ? `/login?${search}` : "/login";
}
