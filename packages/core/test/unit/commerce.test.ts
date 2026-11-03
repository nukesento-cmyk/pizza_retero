import { describe, expect, it } from "vitest";
import { createDaraja, darajaTimestamp, stkPassword } from "../../src/payments/mpesa/daraja";
import { classifyResult } from "../../src/payments/mpesa/gateway";
import { maskPhone, normalizeKenyanMobile } from "../../src/commerce/phone";
import { zoneFor } from "../../src/commerce/zones";
import { distanceM, inPolygon } from "../../src/geo";
import { edge, nextStatuses } from "../../src/orders/state";

describe("phones", () => {
  it.each([["0712 345 678", "+254712345678"], ["712345678", "+254712345678"], ["+254 110 123456", "+254110123456"], ["254712345678", "+254712345678"]])("%s", (i, o) => {
    expect(normalizeKenyanMobile(i)).toBe(o);
  });
  it("rejects non-Kenyan or landline numbers", () => {
    for (const bad of ["020 1234567", "+447700900123", "12345", "07123"]) expect(() => normalizeKenyanMobile(bad)).toThrow();
  });
  it("masks", () => expect(maskPhone("+254712345678")).toBe("2547•••••678"));
});

describe("delivery zones", () => {
  const branch = { lat: -1.2676, lng: 36.8108 }; // Westlands
  const z = (o: Partial<Parameters<typeof zoneFor>[0][number]>) => ({
    id: Math.random().toString(), brandId: "b", branchId: "br", name: "z", radiusM: null, polygon: null, feeMinor: 10000n,
    freeAboveMinor: null, minOrderMinor: null, etaMinutes: 30, active: true, sort: 0, createdAt: new Date(), updatedAt: new Date(), ...o,
  });
  it("picks the tightest radius containing the point", () => {
    const near = z({ name: "near", radiusM: 3000 }), far = z({ name: "far", radiusM: 8000 });
    expect(zoneFor([far, near], branch, { lat: -1.2741, lng: 36.8155 })?.name).toBe("near"); // ~900m
    expect(zoneFor([far, near], branch, { lat: -1.2995, lng: 36.8155 })?.name).toBe("far"); // Upper Hill ~3.6km
    expect(zoneFor([far, near], branch, { lat: -1.0332, lng: 37.0693 })).toBeNull(); // Thika
  });
  it("polygons and inactive zones", () => {
    const poly = z({ name: "poly", polygon: [[-1.25, 36.80], [-1.25, 36.83], [-1.28, 36.83], [-1.28, 36.80]] });
    expect(inPolygon({ lat: -1.26, lng: 36.81 }, poly.polygon!)).toBe(true);
    expect(zoneFor([z({ radiusM: 9000, active: false })], branch, branch)).toBeNull();
    expect(Math.round(distanceM(branch, { lat: -1.2921, lng: 36.8219 }) / 100)).toBe(30);
  });
});

describe("order state machine", () => {
  it("follows the kitchen, delivery and collection workflows", () => {
    expect(edge("new", "accepted", "delivery")?.permission).toBe("kitchen.ticket.update");
    expect(edge("ready", "out_for_delivery", "delivery")).not.toBeNull();
    expect(edge("ready", "out_for_delivery", "collection")).toBeNull();
    expect(edge("ready", "collected", "collection")).not.toBeNull();
    expect(edge("pending_payment", "new", "delivery")?.permission).toBe("system");
    expect(edge("baking", "accepted", "delivery")).toBeNull(); // no going backwards
    expect(edge("preparing", "cancelled", "delivery")).toBeNull(); // food on the bench can't be cancelled
    expect(nextStatuses("completed", "delivery")).toEqual([]);
  });
});

describe("Daraja client", () => {
  const cfg = { environment: "sandbox" as const, consumerKey: "ck", consumerSecret: "cs", shortcode: "174379", passkey: "pk", transactionType: "CustomerPayBillOnline" as const, partyB: "174379" };

  function fakeFetch(handlers: Record<string, (body: unknown) => [number, unknown]>) {
    const calls: { url: string; body: unknown; auth: string | null }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: path, body, auth: (init?.headers as Record<string, string>)?.authorization ?? null });
      const [status, res] = handlers[path]!(body);
      return new Response(JSON.stringify(res), { status });
    }) as unknown as typeof fetch;
    return { f, calls };
  }
  const oauth = () => [200, { access_token: "tok", expires_in: "3599" }] as [number, unknown];

  it("builds a correct STK push (password, EAT timestamp, integer amount) and caches the token", async () => {
    const { f, calls } = fakeFetch({
      "/oauth/v1/generate": oauth,
      "/mpesa/stkpush/v1/processrequest": () => [200, { MerchantRequestID: "m1", CheckoutRequestID: "ws_CO_1", ResponseCode: "0", CustomerMessage: "Success" }],
    });
    const now = new Date("2026-11-03T09:05:07Z"); // 12:05:07 EAT
    const d = createDaraja(cfg, f, () => now);
    const r = await d.stkPush({ amountKes: 950, phone: "254712345678", accountReference: "WES-0001-EXTRA", description: "Order WES-0001", callbackUrl: "https://x/cb" });
    await d.stkPush({ amountKes: 950, phone: "254712345678", accountReference: "A", description: "B", callbackUrl: "https://x/cb" });
    expect(r.checkoutRequestId).toBe("ws_CO_1");
    const push = calls.find((c) => c.url.includes("stkpush"))!.body as Record<string, unknown>;
    expect(push).toMatchObject({ BusinessShortCode: "174379", Timestamp: "20261103120507", Amount: 950, PartyA: "254712345678", PartyB: "174379", AccountReference: "WES-0001-EXT", TransactionDesc: "Order WES-000" });
    expect(push.Password).toBe(stkPassword("174379", "pk", "20261103120507"));
    expect(calls.filter((c) => c.url.includes("oauth"))).toHaveLength(1);
    expect(calls[0]!.auth).toBe(`Basic ${Buffer.from("ck:cs").toString("base64")}`);
    expect(darajaTimestamp(now)).toBe("20261103120507");
  });

  it("refuses fractional amounts and surfaces Daraja errors", async () => {
    const { f } = fakeFetch({ "/oauth/v1/generate": oauth, "/mpesa/stkpush/v1/processrequest": () => [400, { errorCode: "400.002.02", errorMessage: "Bad Request - Invalid PhoneNumber" }] });
    const d = createDaraja(cfg, f);
    await expect(d.stkPush({ amountKes: 9.5, phone: "254712345678", accountReference: "A", description: "B", callbackUrl: "x" })).rejects.toThrow(/whole shillings/);
    await expect(d.stkPush({ amountKes: 10, phone: "2547", accountReference: "A", description: "B", callbackUrl: "x" })).rejects.toThrow(/Invalid PhoneNumber/);
  });

  it("maps STK query states, including 'still processing'", async () => {
    let next: [number, unknown] = [500, { errorCode: "500.001.1001", errorMessage: "The transaction is being processed" }];
    const { f } = fakeFetch({ "/oauth/v1/generate": oauth, "/mpesa/stkpushquery/v1/query": () => next });
    const d = createDaraja(cfg, f);
    expect((await d.stkQuery("x")).state).toBe("pending");
    next = [200, { ResponseCode: "0", ResultCode: "0", ResultDesc: "processed successfully" }];
    expect((await d.stkQuery("x")).state).toBe("succeeded");
    next = [200, { ResponseCode: "0", ResultCode: "1032", ResultDesc: "Request cancelled by user" }];
    expect((await d.stkQuery("x")).state).toBe("cancelled");
  });

  it("classifies result codes", () => {
    expect([0, 1032, 1037, 1, 2001].map(classifyResult)).toEqual(["succeeded", "cancelled", "timeout", "failed", "failed"]);
  });
});
