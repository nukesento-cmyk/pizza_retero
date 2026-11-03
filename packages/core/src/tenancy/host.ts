/**
 * Normalise a Host header into the form stored in `domains.hostname`.
 * Returns null for anything that is not a plausible hostname, so garbage
 * never reaches the database.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  if (host.length === 0 || host.length > 260) return null;
  if (host.endsWith(".")) host = host.slice(0, -1);
  // Drop default ports; keep others (useful for localhost:3000 in dev).
  host = host.replace(/:(80|443)$/, "");
  if (host.startsWith("www.")) host = host.slice(4);
  const valid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$/.test(host);
  return valid ? host : null;
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$|\.localhost(:\d+)?$/;
export const isLocalHost = (host: string): boolean => LOCAL.test(host);
