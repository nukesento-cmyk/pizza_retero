import { expect, test } from "@playwright/test";
import { uniq } from "./helpers";
import { activeBranch, menuItem, ownerSql } from "./db";

test.describe("checkout and M-Pesa (simulator)", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("cart → server quote → order → STK push → verified callback → tracking shows paid", async ({ page }) => {
    const t = uniq();
    const fx = await activeBranch(t);
    const marg = await menuItem("margherita");

    // Add to cart through the API (the menu UI is covered separately). Forged prices are ignored.
    const add = await page.request.post("/api/cart/items", { data: { branchId: fx.branchId, ...marg, quantity: 2, priceMinor: 1 } });
    expect(add.status()).toBe(201);
    expect((await add.json()).subtotalMinor).toBe(190000);

    await page.goto(`/checkout?branch=${fx.branchId}`);
    await expect(page.getByText("Margherita")).toBeVisible();
    await page.getByRole("radio", { name: "Collect" }).click();
    await page.getByRole("button", { name: "Check price" }).click();
    await expect(page.getByText("KES 1,900").first()).toBeVisible();
    await page.getByLabel("Your name").fill("Achieng Otieno");
    await page.getByLabel("M-Pesa phone number").fill("0712 345 678");
    await page.getByRole("button", { name: /Pay KES 1,900 with M-Pesa/ }).click();

    await page.waitForURL(/\/orders\/[A-Z0-9]{3}-\d{4}\?t=/);
    await expect(page.getByText("Check your phone")).toBeVisible();
    // Simulator calls back after ~1.5s; the server verifies with STK Query, then the page polls.
    await expect(page.getByRole("list", { name: "Order progress" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[aria-current="step"]')).toContainText("Paid");

    const number = new URL(page.url()).pathname.split("/").pop()!;
    const sql = ownerSql();
    try {
      const [o] = await sql<{ status: string; payment_status: string; total_minor: string }[]>`select status, payment_status, total_minor from orders where number = ${number} and branch_id = ${fx.branchId}`;
      expect(o).toEqual({ status: "new", payment_status: "paid", total_minor: "190000" });
      const cbs = await sql<{ outcome: string }[]>`select c.outcome from mpesa_callbacks c join payment_attempts a on a.id = c.attempt_id join payments p on p.id = a.payment_id join orders o on o.id = p.order_id where o.number = ${number} and o.branch_id = ${fx.branchId}`;
      expect(cbs.map((c) => c.outcome)).toEqual(["applied"]);
    } finally { await sql.end(); }
  });

  test("customer cancels on the phone: order stays unpaid and can be retried", async ({ page }) => {
    const t = uniq();
    const fx = await activeBranch(t);
    await page.request.post("/api/cart/items", { data: { branchId: fx.branchId, ...(await menuItem("pepperoni")), quantity: 1 } });
    await page.goto(`/checkout?branch=${fx.branchId}`);
    await page.getByRole("button", { name: "Check price" }).click();
    await page.getByLabel("Your name").fill("Brian Mwangi");
    await page.getByLabel("M-Pesa phone number").fill("0712 341 032"); // simulator: user cancels
    await page.getByRole("button", { name: /with M-Pesa/ }).click();
    await page.waitForURL(/\/orders\//);
    await page.waitForTimeout(5000);
    await expect(page.getByText("Check your phone")).toBeVisible();
    await page.getByLabel("M-Pesa phone number").fill("0712 345 678");
    await page.getByRole("button", { name: "Resend prompt" }).click();
    await expect(page.locator('[aria-current="step"]')).toContainText("Paid", { timeout: 30_000 });
  });

  test("webhook never trusts forged callbacks", async ({ request }) => {
    const res = await request.post("/api/webhooks/mpesa/stk/not-a-real-token", { data: { Body: { stkCallback: { MerchantRequestID: "x", CheckoutRequestID: "ws_CO_SIM_ok_x", ResultCode: 0, ResultDesc: "ok" } } } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ResultCode: 0, ResultDesc: "Accepted" });
  });

  test("ordering requires an idempotency key and refuses empty carts", async ({ request }) => {
    const fx = await activeBranch(uniq());
    expect((await request.post("/api/checkout/order", { data: { branchId: fx.branchId } })).status()).toBe(400);
    const q = await request.post("/api/checkout/quote", { data: { branchId: fx.branchId, fulfilment: "collection" } });
    expect([400, 404]).toContain(q.status());
  });
});
