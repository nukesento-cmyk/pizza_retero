import { classifyResult, GatewayError, type MpesaGateway, type ReversalRequest, type StkPushRequest, type StkQueryResult } from "./gateway";

/**
 * Safaricom Daraja client: OAuth, STK Push (Lipa na M-Pesa Online), STK Query
 * and Transaction Reversal. Credentials are passed in from the server
 * environment, never from the database or the browser.
 */
export interface DarajaConfig {
  environment: "sandbox" | "production";
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  transactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  /** PartyB: shortcode for Paybill, till number for Buy Goods. */
  partyB: string;
  initiatorName?: string;
  securityCredential?: string;
}

const BASE = { sandbox: "https://sandbox.safaricom.co.ke", production: "https://api.safaricom.co.ke" } as const;

/** yyyyMMddHHmmss in East Africa Time, as Daraja expects. */
export function darajaTimestamp(at = new Date()): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}${g("month")}${g("day")}${g("hour")}${g("minute")}${g("second")}`;
}

export const stkPassword = (shortcode: string, passkey: string, ts: string) => Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");

export function createDaraja(cfg: DarajaConfig, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): MpesaGateway {
  const base = BASE[cfg.environment];
  let token: { value: string; exp: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.exp > Date.now() + 30_000) return token.value;
    const res = await fetchImpl(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { authorization: `Basic ${Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: string | number };
    if (!res.ok || !body.access_token) throw new GatewayError("Daraja OAuth failed", res.status, body);
    token = { value: body.access_token, exp: Date.now() + Number(body.expires_in ?? 3599) * 1000 };
    return token.value;
  }

  async function post(path: string, payload: Record<string, unknown>) {
    const res = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, body };
  }

  return {
    kind: "daraja",
    async stkPush(req: StkPushRequest) {
      if (!Number.isInteger(req.amountKes) || req.amountKes < 1) throw new GatewayError("Amount must be whole shillings ≥ 1");
      const ts = darajaTimestamp(now());
      const { res, body } = await post("/mpesa/stkpush/v1/processrequest", {
        BusinessShortCode: cfg.shortcode,
        Password: stkPassword(cfg.shortcode, cfg.passkey, ts),
        Timestamp: ts,
        TransactionType: cfg.transactionType,
        Amount: req.amountKes,
        PartyA: req.phone,
        PartyB: cfg.partyB,
        PhoneNumber: req.phone,
        CallBackURL: req.callbackUrl,
        AccountReference: req.accountReference.slice(0, 12),
        TransactionDesc: req.description.slice(0, 13),
      });
      if (!res.ok || String(body.ResponseCode) !== "0") {
        throw new GatewayError(String(body.errorMessage ?? body.ResponseDescription ?? "STK push rejected"), res.status, body);
      }
      return {
        merchantRequestId: String(body.MerchantRequestID), checkoutRequestId: String(body.CheckoutRequestID),
        customerMessage: String(body.CustomerMessage ?? "Check your phone to complete payment."), raw: body,
      };
    },
    async stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
      const ts = darajaTimestamp(now());
      const { res, body } = await post("/mpesa/stkpushquery/v1/query", {
        BusinessShortCode: cfg.shortcode, Password: stkPassword(cfg.shortcode, cfg.passkey, ts), Timestamp: ts, CheckoutRequestID: checkoutRequestId,
      });
      // While the customer is still entering their PIN Daraja answers 500 "The transaction is being processed".
      if (String(body.errorCode ?? "") === "500.001.1001" || /being processed/i.test(String(body.errorMessage ?? ""))) {
        return { state: "pending", resultDesc: String(body.errorMessage ?? "Processing") };
      }
      if (!res.ok || body.ResultCode === undefined) throw new GatewayError(String(body.errorMessage ?? "STK query failed"), res.status, body);
      const code = Number(body.ResultCode);
      const state = classifyResult(code);
      return state === "succeeded" ? { state, resultCode: 0, resultDesc: String(body.ResultDesc) } : { state, resultCode: code, resultDesc: String(body.ResultDesc) };
    },
    async reversal(req: ReversalRequest) {
      if (!cfg.initiatorName || !cfg.securityCredential) throw new GatewayError("Reversal requires initiator credentials");
      const { res, body } = await post("/mpesa/reversal/v1/request", {
        Initiator: cfg.initiatorName, SecurityCredential: cfg.securityCredential, CommandID: "TransactionReversal",
        TransactionID: req.transactionId, Amount: req.amountKes, ReceiverParty: cfg.shortcode, RecieverIdentifierType: "11",
        ResultURL: req.resultUrl, QueueTimeOutURL: req.timeoutUrl, Remarks: req.remarks.slice(0, 100), Occasion: "Refund",
      });
      if (!res.ok || String(body.ResponseCode) !== "0") throw new GatewayError(String(body.errorMessage ?? body.ResponseDescription ?? "Reversal rejected"), res.status, body);
      return { conversationId: String(body.ConversationID), originatorConversationId: String(body.OriginatorConversationID), raw: body };
    },
  };
}
