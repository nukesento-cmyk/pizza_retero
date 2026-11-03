import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext", () => {
  it.each([
    ["/ops", "/ops"],
    ["/ops/branches?x=1", "/ops/branches?x=1"],
    [null, "/ops"],
    ["https://evil.com", "/ops"],
    ["//evil.com", "/ops"],
    ["/\\evil.com", "/ops"],
    ["/ok\r\nSet-Cookie: x", "/ops"],
  ])("%j → %j", (input, out) => expect(safeNext(input)).toBe(out));
});
