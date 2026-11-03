import { describe, expect, it } from "vitest";
import { isLocalHost, normalizeHost } from "../../src/tenancy/host";
import { hashIp } from "../../src/audit";

describe("normalizeHost", () => {
  it.each([
    ["Westlands.Brand.COM", "westlands.brand.com"],
    ["www.brand.com", "brand.com"],
    ["brand.com.", "brand.com"],
    ["brand.com:443", "brand.com"],
    ["localhost:3000", "localhost:3000"],
  ])("%s → %s", (input, out) => expect(normalizeHost(input)).toBe(out));

  it.each(["", "a b.com", "brand.com/path", "-bad.com", "x".repeat(300), "brand.com:99999999"])("rejects %j", (h) => {
    expect(normalizeHost(h)).toBeNull();
  });

  it("detects local hosts", () => {
    expect(isLocalHost("localhost:3000")).toBe(true);
    expect(isLocalHost("westlands.localhost:3000")).toBe(true);
    expect(isLocalHost("brand.com")).toBe(false);
  });
});

describe("hashIp", () => {
  it("is stable per salt and does not contain the IP", () => {
    const a = hashIp("41.90.1.2", "salt-a");
    expect(a).toBe(hashIp("41.90.1.2", "salt-a"));
    expect(a).not.toBe(hashIp("41.90.1.2", "salt-b"));
    expect(a).not.toContain("41.90");
    expect(hashIp(null, "s")).toBeNull();
  });
});
