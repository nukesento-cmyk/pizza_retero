/**
 * Opening-hours maths, timezone-aware, no dependencies. Intervals whose close
 * time is earlier than their open time run past midnight into the next day.
 */
export interface HoursRow { dayOfWeek: number; opensAt: string; closesAt: string } // "HH:MM[:SS]"
export interface Closure { startsAt: Date; endsAt: Date }

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
};

/** Local weekday (0=Sun) and minutes since midnight for `at` in `timeZone`. */
export function localClock(at: Date, timeZone: string): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { dow, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function isOpenAt(hours: readonly HoursRow[], closures: readonly Closure[], timeZone: string, at: Date): boolean {
  if (closures.some((c) => at >= c.startsAt && at < c.endsAt)) return false;
  const { dow, minutes } = localClock(at, timeZone);
  const yesterday = (dow + 6) % 7;
  return hours.some((h) => {
    const o = toMin(h.opensAt), c = toMin(h.closesAt);
    if (o < c) return h.dayOfWeek === dow && minutes >= o && minutes < c;
    // overnight interval
    return (h.dayOfWeek === dow && minutes >= o) || (h.dayOfWeek === yesterday && minutes < c);
  });
}

/** Validates a weekly schedule: well-formed times, no overlapping intervals on a day. */
export function validateWeek(rows: readonly HoursRow[]): string | null {
  const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  for (const r of rows) {
    if (!Number.isInteger(r.dayOfWeek) || r.dayOfWeek < 0 || r.dayOfWeek > 6) return "Day must be 0–6.";
    if (!TIME.test(r.opensAt) || !TIME.test(r.closesAt)) return "Times must be HH:MM.";
    if (toMin(r.opensAt) === toMin(r.closesAt)) return "An interval can't open and close at the same time.";
  }
  // Expand to minute ranges across the week (overnight spills into next day) and check overlap.
  const spans = rows.map((r) => {
    const s = r.dayOfWeek * 1440 + toMin(r.opensAt);
    let e = r.dayOfWeek * 1440 + toMin(r.closesAt);
    if (e <= s) e += 1440;
    return [s, e] as const;
  }).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) if (spans[i]![0] < spans[i - 1]![1]) return "Opening intervals overlap.";
  const last = spans.at(-1), first = spans[0];
  if (last && first && last[1] > 7 * 1440 && last[1] - 7 * 1440 > first[0]) return "Opening intervals overlap.";
  return null;
}
