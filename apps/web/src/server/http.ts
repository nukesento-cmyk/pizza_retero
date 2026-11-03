import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { toHttp } from "@retero/shared/errors";
import { log } from "./log";
import { rateLimit } from "./rate-limit";

/** JSON with bigint → number (prices are far below 2^53). */
export function json(data: unknown, init: ResponseInit = {}) {
  return new NextResponse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v)), {
    ...init, headers: { "content-type": "application/json", "cache-control": "no-store", ...init.headers },
  });
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}

/** Wrap a public API handler: per-IP rate limit, typed error mapping, request id. */
export async function handle(name: string, limit: { n: number; windowMs: number }, fn: () => Promise<Response>) {
  const requestId = (await headers()).get("x-request-id") ?? crypto.randomUUID();
  const ip = await clientIp();
  const rl = rateLimit(`${name}:${ip}`, limit.n, limit.windowMs);
  if (!rl.ok) return json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down.", requestId } }, { status: 429, headers: { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) } });
  try {
    return await fn();
  } catch (e) {
    const { status, body } = toHttp(e, requestId);
    if (status >= 500) log.error(`${name}.failed`, { requestId, err: e });
    return json(body, { status });
  }
}

export async function readJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error("too large"), { status: 413 });
  try { return JSON.parse(text); } catch { return null; }
}
