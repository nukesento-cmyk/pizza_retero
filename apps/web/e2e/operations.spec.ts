import { expect, test, type APIRequestContext } from "@playwright/test";
import { devSignIn, uniq } from "./helpers";
import { activeBranch, grantRole, menuItem, ownerSql } from "./db";

/** A paid collection order via the public API + M-Pesa simulator. */
async function paidOrder(request: APIRequestContext, branchId: string) {
  await request.post("/api/cart/items", { data: { branchId, ...(await menuItem("margherita")), quantity: 1 } });
  const q = await (await request.post("/api/checkout/quote", { data: { branchId, fulfilment: "collection" } })).json();
  const o = await (await request.post("/api/checkout/order", { headers: { "idempotency-key": `e2e-ops-${q.quoteId}` }, data: { branchId, quoteId: q.quoteId, contact: { name: "Ops Test", phone: "0712345678" } } })).json();
  const t = new URL(o.trackingUrl, "http://x").searchParams.get("t")!;
  await request.post(`/api/orders/${o.number}/pay`, { data: { t, phone: "0712345678" } });
  for (let i = 0; i < 30; i++) {
    const v = await (await request.get(`/api/orders/${o.number}?t=${t}`)).json();
    if (v.status === "new") return o.number as string;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("order never became paid");
}

test.describe("operations", () => {
  test.skip(({ isMobile }) => isMobile, "ops journeys run on desktop");
  test.describe.configure({ mode: "serial", timeout: 150_000 });

  test("paid order appears on the kitchen board and moves through the line; the counter hands it over", async ({ page, browser, request }) => {
    const t = uniq();
    const fx = await activeBranch(t);
    const number = await paidOrder(request, fx.branchId);

    const cook = `cook-${t}@retero.test`;
    await devSignIn(page, cook);
    await grantRole(cook, "kitchen_staff", fx, "branch");
    await page.goto(`/ops/br/${fx.branchId}/kitchen`);
    const card = page.locator("li", { hasText: number });
    await expect(page.getByRole("region", { name: "NEW tickets" }).getByText(number)).toBeVisible();
    await expect(card.getByText(/gluten/i)).toBeVisible(); // allergen shown to the line
    for (const [btn, col] of [["Accept", "ACCEPTED"], ["Start", "PREPARING"], ["Into oven", "BAKING"], ["Ready", "READY"]] as const) {
      await page.getByRole("region", { name: /tickets$/ }).locator("li", { hasText: number }).getByRole("button", { name: btn }).click();
      await expect(page.getByRole("region", { name: `${col} tickets` }).getByText(number)).toBeVisible();
    }

    const mgrEmail = `mgr-${t}@retero.test`;
    const mgr = await browser.newContext();
    const mp = await mgr.newPage();
    await devSignIn(mp, mgrEmail);
    await grantRole(mgrEmail, "branch_manager", fx, "branch");
    await mp.goto(`/ops/br/${fx.branchId}/orders`);
    await mp.getByRole("link", { name: number }).click();
    await mp.getByRole("button", { name: "Mark collected" }).click();
    await expect(mp.getByRole("button", { name: "Mark completed" })).toBeVisible(); // now collected
    await mgr.close();
  });

  test("WhatsApp hand-off: the storefront cart reference is finished by staff through the same engine", async ({ page, browser, request }) => {
    const t = uniq();
    const fx = await activeBranch(t);
    const sql = ownerSql();
    try { await sql`update brand_settings set whatsapp_number = '+254700000001' where brand_id = ${fx.brandId}`; } finally { await sql.end(); }

    await request.post("/api/cart/items", { data: { branchId: fx.branchId, ...(await menuItem("pepperoni", "party")), quantity: 2 } });
    const h = await (await request.post("/api/whatsapp/handoff", { data: { branchId: fx.branchId } })).json();
    expect(h.url).toMatch(/^https:\/\/wa\.me\/254700000001\?text=/);
    expect(decodeURIComponent(h.url)).toContain(`Ref ${h.reference}`);

    const mgrEmail = `wa-${t}@retero.test`;
    await devSignIn(page, mgrEmail);
    await grantRole(mgrEmail, "branch_manager", fx, "branch");
    await page.goto(`/ops/br/${fx.branchId}/assisted?ref=${h.reference}`);
    await page.getByRole("button", { name: "Open cart" }).click();
    await expect(page.getByText("2× Pepperoni")).toBeVisible();
    await expect(page.getByText("KES 3,400").first()).toBeVisible();
    await page.getByLabel("Customer name").fill("WhatsApp Customer");
    await page.getByLabel("Customer M-Pesa phone").fill("0712345678");
    await page.getByRole("button", { name: /Place order & send M-Pesa prompt/ }).click();
    await expect(page.getByText(/Order [A-Z0-9]{3}-\d{4} placed/)).toBeVisible();

    // Another branch's manager can't open this cart.
    const other = await activeBranch(`${t}x`);
    const o2 = `wa2-${t}@retero.test`;
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await devSignIn(p2, o2);
    await grantRole(o2, "branch_manager", other, "branch");
    await p2.goto(`/ops/br/${other.branchId}/assisted?ref=${h.reference}`);
    await p2.getByRole("button", { name: "Open cart" }).click();
    await expect(p2.getByText(/Cart not found/i)).toBeVisible();
    await ctx.close();
  });

  test("inventory: track, receive and see stock", async ({ page }) => {
    const t = uniq();
    const fx = await activeBranch(t);
    const email = `inv-${t}@retero.test`;
    await devSignIn(page, email);
    await grantRole(email, "branch_manager", fx, "branch");
    await page.goto(`/ops/br/${fx.branchId}/inventory`);
    await page.getByLabel("Start tracking").selectOption({ label: "Mozzarella (g)" });
    await page.getByLabel("Opening stock").fill("2000");
    await page.getByRole("button", { name: "Track" }).click();
    await expect(page.getByLabel("Mozzarella quantity")).toBeVisible();
    await page.getByLabel("Mozzarella quantity").fill("500");
    await page.getByLabel("Mozzarella quantity").locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("row", { name: /Mozzarella/ }).first()).toContainText("2,500");
  });
});
