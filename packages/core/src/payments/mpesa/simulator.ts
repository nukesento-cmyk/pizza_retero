import { randomBytes } from "node:crypto";
import type { MpesaGateway, StkQueryResult } from "./gateway";

/**
 * LOCAL-ONLY M-Pesa simulator (D-021). Behaves like Daraja closely enough to
 * exercise the real callback, verification and reconciliation code without
 * sandbox credentials. Outcome is chosen by the phone number's last digits:
 *
 *   …1032  customer cancels         …0001  insufficient funds
 *   …9999  no callback (forces reconciliation via STK Query)
 *   anything else: success
 *
 * The outcome is encoded in the CheckoutRequestID, so STK Query is stateless
 * and works from any process (web or worker).
 */
const OUTCOMES = { "1032": [1032, "Request cancelled by user"], "0001": [1, "The balance is insufficient for the transaction."] } as const;

export function createSimulator(opts: { deliver?: boolean; delayMs?: number; fetchImpl?: typeof fetch } = {}): MpesaGateway {
  const deliver = opts.deliver ?? true;
  const send = (url: string, body: unknown) => {
    if (!deliver) return;
    setTimeout(() => {
      (opts.fetchImpl ?? fetch)(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
    }, opts.delayMs ?? 1500);
  };
  return {
    kind: "simulator",
    async stkPush(req) {
      const tail = req.phone.slice(-4);
      const mode = tail === "9999" ? "silent" : tail in OUTCOMES ? tail : "ok";
      const checkoutRequestId = `ws_CO_SIM_${mode}_${randomBytes(6).toString("hex")}`;
      const merchantRequestId = `SIM-${randomBytes(4).toString("hex")}`;
      if (mode !== "silent") {
        const [code, desc] = mode === "ok" ? [0, "The service request is processed successfully."] : OUTCOMES[mode as keyof typeof OUTCOMES];
        send(req.callbackUrl, {
          Body: { stkCallback: {
            MerchantRequestID: merchantRequestId, CheckoutRequestID: checkoutRequestId, ResultCode: code, ResultDesc: desc,
            ...(code === 0 ? { CallbackMetadata: { Item: [
              { Name: "Amount", Value: req.amountKes }, { Name: "MpesaReceiptNumber", Value: `SIM${randomBytes(4).toString("hex").toUpperCase()}` },
              { Name: "TransactionDate", Value: Number(new Date().toISOString().replace(/\D/g, "").slice(0, 14)) }, { Name: "PhoneNumber", Value: Number(req.phone) },
            ] } } : {}),
          } },
        });
      }
      return { merchantRequestId, checkoutRequestId, customerMessage: "Success. Request accepted for processing (simulator)", raw: { simulator: true } };
    },
    async stkQuery(id): Promise<StkQueryResult> {
      const mode = id.split("_")[3];
      if (mode === "1032") return { state: "cancelled", resultCode: 1032, resultDesc: "Request cancelled by user" };
      if (mode === "0001") return { state: "failed", resultCode: 1, resultDesc: "The balance is insufficient for the transaction." };
      return { state: "succeeded", resultCode: 0, resultDesc: "The service request is processed successfully." };
    },
    async reversal(req) {
      const conversationId = `AG_SIM_${randomBytes(6).toString("hex")}`;
      const originatorConversationId = `SIM-${randomBytes(4).toString("hex")}`;
      send(req.resultUrl, { Result: { ResultType: 0, ResultCode: 0, ResultDesc: "The service request is processed successfully.", OriginatorConversationID: originatorConversationId, ConversationID: conversationId, TransactionID: `SIMREV${randomBytes(3).toString("hex").toUpperCase()}` } });
      return { conversationId, originatorConversationId, raw: { simulator: true } };
    },
  };
}
