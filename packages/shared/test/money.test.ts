import { describe, expect, it } from "vitest";
import {
  add, allocate, compare, CurrencyMismatchError, format, money, multiply,
  parseDecimal, percentage, subtract, sum,
} from "../src/money";

describe("money", () => {
  it("rejects non-integer amounts", () => {
    // eslint-disable-next-line no-restricted-syntax -- deliberately invalid
    expect(() => money(10.5, "KES")).toThrow(RangeError);
  });

  it("adds, subtracts and multiplies exactly", () => {
    const a = money(1999, "KES");
    expect(add(a, money(1, "KES")).amount).toBe(2000n);
    expect(subtract(a, money(2000, "KES")).amount).toBe(-1n);
    expect(multiply(a, 3).amount).toBe(5997n);
  });

  it("refuses to mix currencies", () => {
    expect(() => add(money(1, "KES"), money(1, "USD"))).toThrow(CurrencyMismatchError);
  });

  it("sums a list (0.1 + 0.2 problem does not exist here)", () => {
    expect(sum([money(10, "KES"), money(20, "KES")], "KES").amount).toBe(30n);
  });

  it("applies basis-point percentages with half-away-from-zero rounding", () => {
    expect(percentage(money(1005, "KES"), 1000).amount).toBe(101n); // 100.5 → 101
    expect(percentage(money(-1005, "KES"), 1000).amount).toBe(-101n);
    expect(percentage(money(1004, "KES"), 1000).amount).toBe(100n);
  });

  it("allocates without losing a cent", () => {
    const parts = allocate(money(1000, "KES"), 3);
    expect(parts.map((p) => p.amount)).toEqual([334n, 333n, 333n]);
    expect(sum(parts, "KES").amount).toBe(1000n);
  });

  it("parses decimals and rejects excess precision", () => {
    expect(parseDecimal("1250.5", "KES").amount).toBe(125050n);
    expect(parseDecimal("-3", "KES").amount).toBe(-300n);
    expect(() => parseDecimal("1.234", "KES")).toThrow(RangeError);
    expect(() => parseDecimal("1.5", "UGX")).toThrow(RangeError);
    expect(() => parseDecimal("1e3", "KES")).toThrow(RangeError);
  });

  it("formats for display", () => {
    expect(format(money(125050, "KES"))).toBe("KES 1,250.50");
    expect(format(money(-5, "KES"))).toBe("-KES 0.05");
    expect(format(money(5000, "UGX"))).toBe("UGX 5,000");
  });

  it("compares", () => {
    expect(compare(money(1, "KES"), money(2, "KES"))).toBe(-1);
  });
});
