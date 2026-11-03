import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { AppError, parseInput } from "@retero/shared/errors";
import { schema, type Executor } from "@retero/db";
import { authorize } from "../../rbac/authorize";
import type { Actor } from "../../rbac/types";
import { recordAudit } from "../../audit";
import { createDaraja } from "./daraja";
import { createSimulator } from "./simulator";
import type { MpesaGateway } from "./gateway";

export type MpesaAccount = typeof schema.mpesaAccounts.$inferSelect;

/** Franchisee-specific account if configured, else the brand default (Q2). */
export async function resolveAccount(tx: Executor, brandId: string, franchiseeId: string): Promise<MpesaAccount> {
  const rows = await tx.select().from(schema.mpesaAccounts).where(and(eq(schema.mpesaAccounts.brandId, brandId), eq(schema.mpesaAccounts.active, true)));
  const acct = rows.find((r) => r.franchiseeId === franchiseeId) ?? rows.find((r) => r.franchiseeId === null);
  if (!acct) throw new AppError("CONFLICT", "Online payment isn't set up for this branch yet. Please order on WhatsApp or call the branch.");
  return acct;
}

export interface GatewayDeps {
  env: Record<string, string | undefined>;
  /** Only true in local/test environments. */
  allowSimulator: boolean;
  fetchImpl?: typeof fetch;
  simulatorDeliver?: boolean;
}

/** Build the gateway for an account, reading secrets from `${credentialsRef}_*` env vars. */
export function gatewayFor(acct: MpesaAccount, deps: GatewayDeps): MpesaGateway {
  if (acct.environment === "simulator") {
    if (!deps.allowSimulator) throw new AppError("INTERNAL", "M-Pesa simulator is disabled outside local development.");
    return createSimulator({ deliver: deps.simulatorDeliver ?? true, fetchImpl: deps.fetchImpl });
  }
  const v = (k: string) => deps.env[`${acct.credentialsRef}_${k}`];
  const consumerKey = v("CONSUMER_KEY"), consumerSecret = v("CONSUMER_SECRET"), passkey = v("PASSKEY");
  if (!consumerKey || !consumerSecret || !passkey) throw new AppError("INTERNAL", `M-Pesa credentials missing for ${acct.credentialsRef}.`);
  return createDaraja({
    environment: acct.environment, consumerKey, consumerSecret, passkey, shortcode: acct.shortcode,
    transactionType: acct.transactionType as "CustomerPayBillOnline" | "CustomerBuyGoodsOnline",
    partyB: acct.tillNumber ?? acct.shortcode, initiatorName: v("INITIATOR_NAME"), securityCredential: v("SECURITY_CREDENTIAL"),
  }, deps.fetchImpl);
}

export const accountInput = z.object({
  brandId: z.uuid(),
  franchiseeId: z.uuid().nullish(),
  environment: z.enum(["sandbox", "production", "simulator"]),
  shortcode: z.string().regex(/^\d{5,7}$/, "Shortcode is 5–7 digits."),
  tillNumber: z.string().regex(/^\d{5,8}$/).nullish(),
  transactionType: z.enum(["CustomerPayBillOnline", "CustomerBuyGoodsOnline"]),
  credentialsRef: z.string().regex(/^[A-Z][A-Z0-9_]{2,40}$/, "Use an env prefix like MPESA_RETERO."),
}).refine((v) => v.transactionType === "CustomerPayBillOnline" || v.tillNumber, { message: "Buy Goods needs a till number.", path: ["tillNumber"] });

/** Configure settlement for a brand or franchisee. Brand settings permission. */
export async function upsertAccount(tx: Executor, actor: Actor, raw: unknown) {
  const input = parseInput(accountInput, raw);
  authorize(actor, "brand.settings.update", { level: "brand", brandId: input.brandId });
  if (input.environment === "production") authorize(actor, "platform.manage", { level: "platform" }); // going live is a platform decision
  await tx.update(schema.mpesaAccounts).set({ active: false }).where(and(
    eq(schema.mpesaAccounts.brandId, input.brandId),
    input.franchiseeId ? eq(schema.mpesaAccounts.franchiseeId, input.franchiseeId) : isNull(schema.mpesaAccounts.franchiseeId),
  ));
  const [a] = await tx.insert(schema.mpesaAccounts).values({ ...input, franchiseeId: input.franchiseeId ?? null, tillNumber: input.tillNumber ?? null }).returning();
  await recordAudit(tx, actor, { action: "mpesa_account.set", scope: { level: "brand", brandId: input.brandId }, targetType: "mpesa_account", targetId: a!.id, metadata: { environment: input.environment, shortcode: input.shortcode, franchiseeId: input.franchiseeId ?? null } });
  return a!;
}
