import { Money } from "@retero/shared";
import type { CurrencyCode } from "@retero/shared/money";

/** Display only. */
export const fmt = (minor: bigint | number | null | undefined, currency = "KES") =>
  minor === null || minor === undefined ? "—" : Money.format(Money.money(BigInt(minor), currency as CurrencyCode));

/** Minor units → plain decimal string for form inputs ("950" / "950.50"). */
export const toInput = (minor: bigint | number | null | undefined) => {
  if (minor === null || minor === undefined) return "";
  const m = BigInt(minor);
  const whole = m / 100n, cents = m % 100n;
  return cents === 0n ? whole.toString() : `${whole}.${cents.toString().padStart(2, "0")}`;
};
