export const MENU_IMAGE_URL_MAX_LENGTH = 500;

const LOCAL_MENU_IMAGE_PATH_PATTERN =
  /^\/images\/demo\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?\.webp$/;

type MenuImageUrlResult =
  | {
      ok: true;
      value: string | null;
    }
  | {
      ok: false;
};

export function isMenuDemoImagePath(value: string) {
  return (
    value.length <= MENU_IMAGE_URL_MAX_LENGTH &&
    LOCAL_MENU_IMAGE_PATH_PATTERN.test(value) &&
    !value.includes("..")
  );
}

export function normalizeMenuImageUrl(input: string): MenuImageUrlResult {
  const value = input.trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > MENU_IMAGE_URL_MAX_LENGTH) {
    return { ok: false };
  }

  if (isMenuDemoImagePath(value)) {
    return { ok: true, value };
  }

  return { ok: false };
}
