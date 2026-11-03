import { AppError } from "@retero/shared/errors";

/**
 * Normalise a Kenyan mobile number to E.164 (+2547XXXXXXXX / +2541XXXXXXXX).
 * Accepts 07…, 01…, 7…, 2547…, +2547… with spaces/dashes.
 */
export function normalizeKenyanMobile(raw: string): string {
  const d = raw.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  let n: string | null = null;
  if (/^0[17]\d{8}$/.test(d)) n = `254${d.slice(1)}`;
  else if (/^[17]\d{8}$/.test(d)) n = `254${d}`;
  else if (/^254[17]\d{8}$/.test(d)) n = d;
  if (!n) throw new AppError("VALIDATION_FAILED", "Enter a Kenyan mobile number, e.g. 0712 345 678.", { details: [{ path: "phone", message: "Enter a Kenyan mobile number, e.g. 0712 345 678." }] });
  return `+${n}`;
}

/** +254712345678 → 2547•••••678 (logs, receipts, staff screens). */
export const maskPhone = (e164: string) => {
  const d = e164.replace(/^\+/, "");
  return `${d.slice(0, 4)}${"•".repeat(Math.max(0, d.length - 7))}${d.slice(-3)}`;
};
