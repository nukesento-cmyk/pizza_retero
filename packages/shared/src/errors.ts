/**
 * Typed application errors. `core` throws these; the web layer maps them to
 * HTTP responses with `toHttp()`. Messages must be safe to show to users —
 * put internal detail in `cause`, never in `message`.
 */
export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown; details?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.details = options?.details;
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export const forbidden = (message = "You do not have permission to do that.") =>
  new AppError("FORBIDDEN", message);
export const unauthenticated = (message = "Please sign in.") =>
  new AppError("UNAUTHENTICATED", message);
export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found.`);
export const conflict = (message: string) => new AppError("CONFLICT", message);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; requestId?: string; details?: unknown };
}

/** Convert anything thrown into a safe status + body. Unknown errors become INTERNAL. */
export function toHttp(e: unknown, requestId?: string): { status: number; body: ErrorBody } {
  if (isAppError(e)) {
    return {
      status: e.status,
      body: {
        error: {
          code: e.code,
          message: e.message,
          ...(requestId ? { requestId } : {}),
          ...(e.code === "VALIDATION_FAILED" && e.details ? { details: e.details } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Something went wrong.", ...(requestId ? { requestId } : {}) } },
  };
}

/**
 * Parse untrusted input with a Zod schema, converting failures into a
 * VALIDATION_FAILED AppError carrying field-level issues (safe to return).
 */
export function parseInput<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } } }, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  const issues = r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
  throw new AppError("VALIDATION_FAILED", "Some details are missing or invalid.", { details: issues });
}
