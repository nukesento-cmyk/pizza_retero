/** Browser-side display of minor units (numbers from the JSON API). Display only. */
export const kes = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "—" : `KES ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
