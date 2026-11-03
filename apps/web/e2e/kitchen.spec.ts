import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SCREENSHOT_DIR;

async function enter(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Loading the kitchen" })).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /the oven.s on/i })).toBeVisible();
}

async function station(page: Page, title: string) {
  await expect(page.getByRole("region", { name: title })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1600); // let the camera settle before asserting/capturing
}

test.describe("3D kitchen", () => {
  // Headless browsers render WebGL in software; give each journey room and run them one at a time.
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("walk the kitchen and bake a pie", async ({ page }, info) => {
    const snap = async (name: string) => SHOTS && page.screenshot({ path: `${SHOTS}/kitchen-${info.project.name}-${name}.png` });

    await enter(page);
    await page.waitForTimeout(1500);
    await snap("1-entrance");

    await page.getByRole("button", { name: "Start building" }).click();
    await station(page, "Dough Bench");
    const party = page.getByRole("radio", { name: /party/i });
    await party.click();
    await expect(party).toHaveAttribute("aria-checked", "true");
    await snap("2-dough");

    await page.getByRole("button", { name: "Sauce pots", exact: true }).click();
    await station(page, "Sauce Pots");
    await page.getByRole("radio", { name: /basil pesto/i }).click();
    await snap("3-sauce");

    await page.getByRole("button", { name: "The line", exact: true }).click();
    await station(page, "The Line");
    await page.getByRole("button", { name: "Pepperoni", exact: true }).click();
    await page.getByRole("button", { name: "Mushroom", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pepperoni", exact: true })).toHaveAttribute("aria-pressed", "true");
    await snap("4-line");

    await page.getByRole("button", { name: "Check your pie", exact: true }).click();
    await station(page, "Build Your Pie");
    const ticket = page.getByRole("region", { name: "Build Your Pie" });
    await expect(ticket).toContainText("Party");
    await expect(ticket).toContainText("Basil pesto");
    await expect(ticket).toContainText("+ Pepperoni");
    await snap("5-assembly");

    await page.getByRole("button", { name: "Into the oven", exact: true }).click();
    await station(page, "The Oven");
    await page.getByRole("button", { name: "Bake it" }).click();
    await page.waitForTimeout(2200);
    await snap("6-baking");

    // bake completes and the camera carries you to the reveal
    await expect(page.getByRole("region", { name: "Out of the Fire" })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1600);
    await expect(page.getByRole("region", { name: "Out of the Fire" })).not.toContainText("hasn't been baked");
    await snap("7-reveal");

    await page.keyboard.press("End");
    await station(page, "Our Story");
    await snap("8-story");
  });

  test("station rail and keyboard navigate", async ({ page, isMobile }) => {
    test.skip(isMobile, "rail is desktop-only; mobile uses the stepper");
    await enter(page);
    await page.getByRole("navigation", { name: "Kitchen stations" }).getByRole("button", { name: "6 The Oven" }).click();
    await station(page, "The Oven");
    await page.keyboard.press("ArrowUp");
    await station(page, "Build Your Pie");
  });

  test("falls back to the 2D storefront without WebGL", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error test stub
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (type.startsWith("webgl")) return null;
        return orig.call(this, type, ...rest);
      };
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /eight stations/i })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("simple view can be chosen and undone", async ({ page }) => {
    await enter(page);
    await page.getByRole("button", { name: "Simple view" }).click();
    await expect(page.getByRole("heading", { name: /eight stations/i })).toBeVisible();
    await page.getByRole("button", { name: /walk through the kitchen/i }).click();
    await expect(page.getByRole("heading", { name: /the oven.s on/i })).toBeVisible({ timeout: 30_000 });
  });
});
