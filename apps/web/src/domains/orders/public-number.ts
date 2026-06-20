import { randomBytes } from "node:crypto";

function formatPublicOrderDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

export function createPublicOrderNumber(date = new Date()) {
  const suffix = randomBytes(3).toString("hex").toUpperCase();

  return `A-${formatPublicOrderDate(date)}-${suffix}`;
}
