import { expect, test } from "@playwright/test";

test("health endpoint reports the database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
});

test("storefront serves the brand from the database", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("Retero Pizza Co.");
  expect(html).toMatch(/The oven(&#x27;|')s on/);
});

test("page does not scroll horizontally", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("unknown hosts get the closed sign, not another tenant", async ({ request }) => {
  const res = await request.get("/", { headers: { host: "not-a-tenant.example" } });
  expect(await res.text()).toContain("Closed");
  const api = await request.get("/api/tenant", { headers: { host: "not-a-tenant.example" } });
  expect(api.status()).toBe(404);
});

test("ops requires sign-in and preserves the destination", async ({ page }) => {
  await page.goto("/ops");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fops/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("sign-out only accepts POST", async ({ request }) => {
  const res = await request.get("/auth/sign-out", { maxRedirects: 0 });
  expect(res.status()).toBe(405);
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});

test("respects reduced motion", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Simple view" }).click();
  const duration = await page.locator(".neon-sign").first().evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.1);
  await ctx.close();
});
