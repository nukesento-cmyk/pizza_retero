/**
 * Money in integer minor units (e.g. KES cents). Never floats.
 *
 * `bigint` keeps arithmetic exact for any total we could plausibly see,
 * and maps 1:1 to a Postgres `bigint` column.
 */
export type CurrencyCode = "KES" | "USD" | "UGX" | "TZS" | "RWF";

/** ISO 4217 minor-unit exponents for currencies we support. */
const MINOR_UNITS: Record<CurrencyCode, number> = {
  KES: 2,
  USD: 2,
  UGX: 0,
  TZS: 2,
  RWF: 0,
};

export interface Money {
  readonly amount: bigint; // minor units
  readonly currency: CurrencyCode;
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Currency mismatch: ${a} vs ${b}`);
    this.name = "CurrencyMismatchError";
  }
}

export function money(amount: bigint | number, currency: CurrencyCode): Money {
  if (typeof amount === "number") {
    if (!Number.isSafeInteger(amount)) {
      throw new RangeError(`Money amount must be an integer in minor units, got ${amount}`);
    }
    amount = BigInt(amount);
  }
  return Object.freeze({ amount, currency });
}

export const zero = (currency: CurrencyCode): Money => money(0n, currency);

function assertSame(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.amount - b.amount, a.currency);
}

/** Multiply by an integer quantity. */
export function multiply(a: Money, quantity: number | bigint): Money {
  const q = typeof quantity === "number" ? toSafeBigInt(quantity) : quantity;
  return money(a.amount * q, a.currency);
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSame(a, b);
  return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
}

export const isNegative = (a: Money): boolean => a.amount < 0n;

/**
 * Apply a percentage expressed in basis points (1% = 100 bps), rounding
 * half away from zero to the nearest minor unit. Used for discounts and
 * tax extraction; never use floats for this.
 */
export function percentage(a: Money, basisPoints: number): Money {
  const bps = toSafeBigInt(basisPoints);
  const numerator = a.amount * bps;
  const denominator = 10_000n;
  return money(roundHalfAwayFromZero(numerator, denominator), a.currency);
}

/**
 * Split an amount into `parts` shares that sum exactly to the original
 * (remainder distributed to the first shares). Used for settlements.
 */
export function allocate(a: Money, parts: number): Money[] {
  const n = toSafeBigInt(parts);
  if (n <= 0n) throw new RangeError("parts must be positive");
  const base = a.amount / n;
  let remainder = a.amount - base * n;
  const step = remainder < 0n ? -1n : 1n;
  const out: Money[] = [];
  for (let i = 0n; i < n; i++) {
    let share = base;
    if (remainder !== 0n) {
      share += step;
      remainder -= step;
    }
    out.push(money(share, a.currency));
  }
  return out;
}

/** Display formatting only. Never parse the result back. */
export function format(a: Money, locale = "en-KE"): string {
  const exp = MINOR_UNITS[a.currency];
  const negative = a.amount < 0n;
  const abs = negative ? -a.amount : a.amount;
  const divisor = 10n ** BigInt(exp);
  const major = abs / divisor;
  const minor = abs % divisor;
  const majorStr = new Intl.NumberFormat(locale, { useGrouping: true }).format(major);
  const minorStr = exp > 0 ? `.${minor.toString().padStart(exp, "0")}` : "";
  return `${negative ? "-" : ""}${a.currency} ${majorStr}${minorStr}`;
}

/** Parse a decimal string such as "1250.50" into minor units. Rejects excess precision. */
export function parseDecimal(input: string, currency: CurrencyCode): Money {
  const exp = MINOR_UNITS[currency];
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match) throw new RangeError(`Not a decimal amount: "${input}"`);
  const [, sign, whole, frac = ""] = match;
  if (frac.length > exp) throw new RangeError(`Too many decimal places for ${currency}: "${input}"`);
  const minor = BigInt(whole! + frac.padEnd(exp, "0"));
  return money(sign ? -minor : minor, currency);
}

export const minorUnitsOf = (currency: CurrencyCode): number => MINOR_UNITS[currency];

function toSafeBigInt(n: number): bigint {
  if (!Number.isSafeInteger(n)) throw new RangeError(`Expected an integer, got ${n}`);
  return BigInt(n);
}

function roundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}
