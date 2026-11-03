import { pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "@retero/shared/ids";

/** Primary key: UUIDv7 generated in the application. */
export const pk = () => uuid("id").primaryKey().$defaultFn(() => uuidv7());

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const scopeType = pgEnum("scope_type", ["platform", "brand", "franchisee", "branch"]);
export type ScopeType = (typeof scopeType.enumValues)[number];

export const tenantStatus = pgEnum("tenant_status", ["pending", "active", "suspended", "closed"]);
export type TenantStatus = (typeof tenantStatus.enumValues)[number];
