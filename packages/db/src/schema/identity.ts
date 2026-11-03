import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

/**
 * Local profile for a managed-auth identity. `id` equals the auth provider's
 * subject (Supabase `auth.users.id`). No credentials are stored here.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email"),
    phone: text("phone"), // E.164
    displayName: text("display_name"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_uq").on(sql`lower(${t.email})`),
    uniqueIndex("users_phone_uq").on(t.phone),
    check("users_phone_e164", sql`${t.phone} IS NULL OR ${t.phone} ~ '^\\+[1-9][0-9]{6,14}$'`),
  ],
);
