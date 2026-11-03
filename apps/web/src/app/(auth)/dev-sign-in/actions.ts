"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { schema, sql, withActor, withSystem } from "@retero/db";
import { identity } from "@retero/core";
import { uuidv7 } from "@retero/shared/ids";
import { writeDevSession } from "@/server/auth/dev";
import { db, systemDb } from "@/server/db";
import { devAuthEnabled } from "@/server/env";
import { safeNext } from "@/server/safe-redirect";

export async function devSignIn(_: unknown, fd: FormData): Promise<{ message: string } | null> {
  if (!devAuthEnabled()) return { message: "Development sign-in is disabled." };
  const email = z.email().safeParse(String(fd.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { message: "Enter a valid email." };

  // Look the user up by email on the system pool (RLS hides other users' rows).
  const existing = await withSystem(systemDb(), "dev-sign-in", (tx) =>
    tx.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email.data}`));
  const id = existing[0]?.id ?? uuidv7();
  await withActor(db(), id, (tx) => identity.syncUser(tx, { id, email: email.data }));
  await writeDevSession(id);
  redirect(safeNext(String(fd.get("next") ?? "")) as never);
}
