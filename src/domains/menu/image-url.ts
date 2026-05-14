export const MENU_IMAGE_URL_MAX_LENGTH = 500;

type MenuImageUrlResult =
  | {
      ok: true;
      value: string | null;
    }
  | {
      ok: false;
    };

export function normalizeMenuImageUrl(input: string): MenuImageUrlResult {
  const value = input.trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > MENU_IMAGE_URL_MAX_LENGTH) {
    return { ok: false };
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return { ok: false };
    }

    url.hash = "";

    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false };
  }
}
