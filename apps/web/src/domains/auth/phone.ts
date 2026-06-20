export function normalizePhone(rawPhone: string) {
  const compact = rawPhone.replace(/[^\d+]/g, "");

  if (compact.startsWith("+")) {
    return compact;
  }

  if (compact.length === 11 && compact.startsWith("8")) {
    return `+7${compact.slice(1)}`;
  }

  if (compact.length === 11 && compact.startsWith("7")) {
    return `+${compact}`;
  }

  if (compact.length === 10) {
    return `+7${compact}`;
  }

  return compact;
}

export function isValidPhone(phone: string) {
  return /^\+7\d{10}$/.test(phone);
}
