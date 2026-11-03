import { expect, test } from "@playwright/test";
import { devSignIn, makePlatformOwner, uniq } from "./helpers";
import { activeBranch, grantRole } from "./db";

// 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test.describe("catalogue", () => {
  test.skip(({ isMobile }) => isMobile, "ops journeys run on desktop");
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("brand admin builds a product with a photo; a branch overrides price within bounds; public menu reflects it", async ({ page, browser, request }) => {
    const t = uniq();
    const owner = `cat-owner-${t}@retero.test`;
    await devSignIn(page, owner);
    makePlatformOwner(owner);
    const fx = await activeBranch(t);

    await page.goto(`/ops/b/${fx.brandId}/menu`);
    await page.getByLabel("New product name").fill(`Nduja ${t}`);
    await page.getByLabel("Slug").first().fill(`nduja-${t}`);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("link", { name: `Nduja ${t}` }).click();

    // Publishing without a size is refused.
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText(/at least one size/)).toBeVisible();

    await page.getByLabel("Size name").fill("Classic 12\"");
    await page.getByLabel("Code").fill("classic");
    await page.getByLabel("Size family").fill("classic");
    await page.getByLabel("Price KES").fill("1200.50");
    await page.getByRole("button", { name: "Save size" }).click();
    await expect(page.getByText(/whole shillings/)).toBeVisible();
    await page.getByLabel("Price KES").fill("1200");
    await page.getByLabel("Min", { exact: true }).fill("1100");
    await page.getByLabel("Max", { exact: true }).fill("1300");
    await page.getByRole("button", { name: "Save size" }).click();
    await expect(page.getByText("Size saved.")).toBeVisible();

    await page.getByLabel("Product photo").setInputFiles({ name: "nduja.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Photo saved.")).toBeVisible();
    const src = await page.getByAltText("Product photo").getAttribute("src");
    const img = await request.get(src!);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toBe("image/png");

    // A file pretending to be a PNG is rejected after upload.
    await page.getByLabel("Product photo").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
    await expect(page.getByText(/contents don't match/)).toBeVisible();

    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();

    // Branch manager: override within bounds, refuse outside.
    const mgrEmail = `cat-mgr-${t}@retero.test`;
    const mgr = await browser.newContext();
    const mp = await mgr.newPage();
    await devSignIn(mp, mgrEmail);
    await grantRole(mgrEmail, "branch_manager", { brandId: fx.brandId, branchId: fx.branchId }, "branch");
    await mp.goto(`/ops/br/${fx.branchId}/menu`);
    const field = mp.getByLabel(`Nduja ${t} Classic 12" branch price`);
    await field.fill("1500");
    await field.locator("xpath=ancestor::form").getByRole("button", { name: "Set" }).click();
    await expect(mp.getByText(/outside the range/)).toBeVisible();
    await field.fill("1250");
    await field.locator("xpath=ancestor::form").getByRole("button", { name: "Set" }).click();
    await expect(mp.getByText("Branch price set.")).toBeVisible();
    // Managers can't reach brand catalogue admin.
    expect((await mp.goto(`/ops/b/${fx.brandId}/menu`))?.status()).toBe(404);
    await mgr.close();

    const menu = await (await request.get(`/api/menu?branch=e2e-${t}`)).json();
    const p = menu.products.find((x: { slug: string }) => x.slug === `nduja-${t}`);
    expect(p.variants[0].priceMinor).toBe(125000);
    expect(p.imageUrl).toMatch(/^\/media\/brands\//);
  });
});
