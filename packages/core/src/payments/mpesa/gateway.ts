/** What the payments service needs from M-Pesa. Implemented by Daraja (real) and the local simulator. */
export interface StkPushRequest {
  amountKes: number; // integer shillings
  phone: string; // 2547XXXXXXXX
  accountReference: string; // ≤ 12 chars
  description: string; // ≤ 13 chars
  callbackUrl: string;
}

export interface StkPushResponse {
  merchantRequestId: string;
  checkoutRequestId: string;
  customerMessage: string;
  raw: Record<string, unknown>;
}

export type StkQueryResult =
  | { state: "succeeded"; resultCode: 0; resultDesc: string }
  | { state: "failed" | "cancelled" | "timeout"; resultCode: number; resultDesc: string }
  | { state: "pending"; resultDesc: string };

export interface ReversalRequest { transactionId: string; amountKes: number; remarks: string; resultUrl: string; timeoutUrl: string }
export interface ReversalResponse { conversationId: string; originatorConversationId: string; raw: Record<string, unknown> }

export interface MpesaGateway {
  readonly kind: "daraja" | "simulator";
  stkPush(req: StkPushRequest): Promise<StkPushResponse>;
  stkQuery(checkoutRequestId: string): Promise<StkQueryResult>;
  reversal(req: ReversalRequest): Promise<ReversalResponse>;
}

/** STK result codes → our attempt state (Daraja docs + observed sandbox behaviour). */
export function classifyResult(code: number): "succeeded" | "failed" | "cancelled" | "timeout" {
  if (code === 0) return "succeeded";
  if (code === 1032) return "cancelled"; // cancelled by user
  if (code === 1037 || code === 1019 || code === 1001) return "timeout"; // unreachable / expired / subscriber locked
  return "failed"; // 1 insufficient funds, 2001 wrong PIN, 1025/9999 system errors, …
}

export class GatewayError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: unknown) {
    super(message);
    this.name = "GatewayError";
  }
}
