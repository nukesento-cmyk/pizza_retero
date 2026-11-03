export type ScopeType = "platform" | "brand" | "franchisee" | "branch";

/**
 * Where a resource lives in the hierarchy. Callers build this from the
 * *stored* resource (never from request input), so ancestors are trustworthy.
 */
export type ResourceScope =
  | { level: "platform" }
  | { level: "brand"; brandId: string }
  | { level: "franchisee"; brandId: string; franchiseeId: string }
  | { level: "branch"; brandId: string; franchiseeId: string; branchId: string };

export interface Grant {
  membershipId: string;
  roleKey: string;
  rank: number;
  scope: ScopeType;
  brandId: string | null;
  franchiseeId: string | null;
  branchId: string | null;
  permissions: ReadonlySet<string>;
}

/** Who is making a call. Built server-side from a verified session. */
export type Actor =
  | { kind: "anonymous" }
  | { kind: "user"; userId: string; grants: readonly Grant[] }
  | { kind: "system"; reason: string };
