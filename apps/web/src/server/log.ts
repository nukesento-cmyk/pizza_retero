import "server-only";

/**
 * Structured JSON logs (one line per event) for the platform log drain.
 * Never log secrets, tokens, full phone numbers or payment payloads.
 */
type Level = "debug" | "info" | "warn" | "error";

const REDACT = /(token|secret|password|passkey|authorization|cookie)/i;

function serialise(v: unknown, depth = 0): unknown {
  if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack?.split("\n").slice(0, 6).join("\n"), cause: v.cause ? serialise(v.cause, depth + 1) : undefined };
  if (v && typeof v === "object" && depth < 4) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, REDACT.test(k) ? "[redacted]" : serialise(x, depth + 1)]));
  }
  return v;
}

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(serialise(fields) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (e: string, f?: Record<string, unknown>) => process.env.LOG_LEVEL === "debug" && emit("debug", e, f),
  info: (e: string, f?: Record<string, unknown>) => emit("info", e, f),
  warn: (e: string, f?: Record<string, unknown>) => emit("warn", e, f),
  error: (e: string, f?: Record<string, unknown>) => emit("error", e, f),
};
