import { kitchen } from "@retero/core";
import { withActor } from "@retero/db";
import { getSession, rlsUserId } from "@/server/auth/session";
import { db } from "@/server/db";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

/** Kitchen board data for polling. Read through RLS as the signed-in staff member. */
export async function GET(_req: Request, { params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const s = await getSession();
  if (s.actor.kind !== "user") return json({ error: { code: "UNAUTHENTICATED", message: "Sign in." } }, { status: 401 });
  const board = await withActor(db(), rlsUserId(s), (tx) => kitchen.board(tx, branchId));
  return json(board);
}
