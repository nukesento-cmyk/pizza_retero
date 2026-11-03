import { describe, expect, it } from "vitest";
import { isOpenAt, localClock, validateWeek } from "../../src/hours";

const NBO = "Africa/Nairobi"; // UTC+3, no DST
const at = (iso: string) => new Date(iso);

describe("opening hours", () => {
  const week = [
    { dayOfWeek: 1, opensAt: "10:00", closesAt: "22:00" }, // Mon
    { dayOfWeek: 5, opensAt: "18:00", closesAt: "02:00" }, // Fri late
  ];

  it("reads the local clock in the branch timezone", () => {
    expect(localClock(at("2026-11-02T07:30:00Z"), NBO)).toEqual({ dow: 1, minutes: 10 * 60 + 30 });
  });

  it("handles same-day intervals", () => {
    expect(isOpenAt(week, [], NBO, at("2026-11-02T07:00:00Z"))).toBe(true); // Mon 10:00 local
    expect(isOpenAt(week, [], NBO, at("2026-11-02T06:59:00Z"))).toBe(false); // Mon 09:59
    expect(isOpenAt(week, [], NBO, at("2026-11-02T19:00:00Z"))).toBe(false); // Mon 22:00 (closed)
  });

  it("handles intervals past midnight", () => {
    expect(isOpenAt(week, [], NBO, at("2026-11-06T22:30:00Z"))).toBe(true); // Sat 01:30 local, from Fri
    expect(isOpenAt(week, [], NBO, at("2026-11-06T23:00:00Z"))).toBe(false); // Sat 02:00
  });

  it("closures override hours", () => {
    const c = [{ startsAt: at("2026-11-02T00:00:00Z"), endsAt: at("2026-11-03T00:00:00Z") }];
    expect(isOpenAt(week, c, NBO, at("2026-11-02T08:00:00Z"))).toBe(false);
  });

  it("validates schedules", () => {
    expect(validateWeek(week)).toBeNull();
    expect(validateWeek([{ dayOfWeek: 1, opensAt: "10:00", closesAt: "15:00" }, { dayOfWeek: 1, opensAt: "14:00", closesAt: "18:00" }])).toMatch(/overlap/);
    expect(validateWeek([{ dayOfWeek: 1, opensAt: "22:00", closesAt: "03:00" }, { dayOfWeek: 2, opensAt: "02:00", closesAt: "05:00" }])).toMatch(/overlap/);
    expect(validateWeek([{ dayOfWeek: 6, opensAt: "22:00", closesAt: "03:00" }, { dayOfWeek: 0, opensAt: "02:00", closesAt: "05:00" }])).toMatch(/overlap/);
    expect(validateWeek([{ dayOfWeek: 7, opensAt: "10:00", closesAt: "11:00" }])).toMatch(/Day/);
    expect(validateWeek([{ dayOfWeek: 1, opensAt: "10", closesAt: "11:00" }])).toMatch(/HH:MM/);
  });
});
