import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, forbidden, isUuid, loadEnv, toHttp, uuidv7 } from "../src";

describe("uuidv7", () => {
  it("is a valid v7 uuid and time-ordered", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe("7");
    expect(a < b).toBe(true);
  });
});

describe("errors", () => {
  it("maps AppError to status and safe body", () => {
    const { status, body } = toHttp(forbidden(), "req-1");
    expect(status).toBe(403);
    expect(body.error).toEqual({ code: "FORBIDDEN", message: expect.any(String), requestId: "req-1" });
  });

  it("hides unknown error details", () => {
    const { status, body } = toHttp(new Error("password=hunter2"));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });
});

describe("loadEnv", () => {
  it("reports variable names but not values", () => {
    const schema = z.object({ SECRET: z.string().min(10) });
    try {
      loadEnv(schema, { SECRET: "short-val" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as Error).message).toContain("SECRET");
      expect((e as Error).message).not.toContain("short-val");
    }
  });
});
