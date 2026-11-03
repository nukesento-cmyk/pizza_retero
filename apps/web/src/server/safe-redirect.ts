/** Only allow same-origin relative paths as post-login destinations (prevents open redirects). */
export function safeNext(raw: string | null | undefined, fallback = "/ops"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(raw)) return fallback;
  return raw;
}
