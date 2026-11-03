import { expect, test, type Page } from "@playwright/test";

/** Sum JS bytes fetched for a page load and report the largest script. */
async function scripts(page: Page, url: string, settle: "networkidle" | number = "networkidle") {
  const sizes: { url: string; bytes: number }[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() !== "script") return;
    const body = await r.body().catch(() => Buffer.alloc(0));
    sizes.push({ url: r.url(), bytes: body.length });
  });
  await page.goto(url);
  if (settle === "networkidle") await page.waitForLoadState("networkidle");
  else { await page.waitForLoadState("load"); await page.waitForTimeout(settle); }
  return { total: sizes.reduce((s, x) => s + x.bytes, 0), largest: Math.max(0, ...sizes.map((s) => s.bytes)) };
}

test.describe("performance budgets", () => {
  test.skip(({ isMobile }) => isMobile, "measured once, on desktop");

  test("the 3D engine is not downloaded without WebGL (fallback stays light)", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error test stub
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        return type.startsWith("webgl") ? null : orig.call(this, type as "2d", ...(rest as []));
      };
    });
    const r = await scripts(page, "/");
    expect(r.largest).toBeLessThan(400 * 1024); // the ~1.3 MB 3D chunk must not appear
    expect(r.total).toBeLessThan(1100 * 1024);
  });

  test("3D kitchen stays within its JS budget and models are small", async ({ page, request }) => {
    test.setTimeout(60_000);
    const r = await scripts(page, "/", 8000); // the 3D scene keeps streaming assets; measure after it settles
    expect(r.total).toBeLessThan(2600 * 1024);
    const manifest = await (await request.get("/models/manifest.json")).json();
    const total = Object.values(manifest.models as Record<string, { bytes: number }>).reduce((s, m) => s + m.bytes, 0);
    expect(total).toBeLessThan(6 * 1024 * 1024);
  });

  test("ops console doesn't ship the 3D engine", async ({ page }) => {
    const r = await scripts(page, "/sign-in");
    expect(r.largest).toBeLessThan(400 * 1024);
  });
});
