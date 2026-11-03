import { expect, test } from "@playwright/test";
import { devSignIn, makePlatformOwner, uniq } from "./helpers";

test.describe("franchise administration", () => {
  test.skip(({ isMobile }) => isMobile, "ops journeys run on desktop");
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("platform owner onboards a franchisee, opens a branch, sets hours and invites a cook who accepts", async ({ page, browser }) => {
    const t = uniq();
    const ownerEmail = `owner-${t}@retero.test`;
    await devSignIn(page, ownerEmail);
    makePlatformOwner(ownerEmail);
    await page.goto("/ops/platform");
    await expect(page.getByRole("heading", { name: "Platform" })).toBeVisible();

    await page.getByRole("link", { name: "Retero Pizza Co." }).first().click();
    await page.getByLabel("Trading name").fill(`Westlands ${t}`);
    await page.getByLabel("Legal name").fill(`Westlands ${t} Foods Ltd`);
    await page.getByRole("button", { name: "Onboard" }).click();
    await page.getByRole("link", { name: `Westlands ${t}` }).click();

    await page.getByLabel("Name", { exact: true }).first().fill(`Westlands ${t}`);
    await page.getByLabel("Slug").fill(`westlands-${t}`);
    await page.getByLabel("Area").first().fill("Westlands");
    await page.getByRole("button", { name: "Create branch" }).click();
    await expect(page.getByText(/created \(pending\)/)).toBeVisible();
    await page.getByRole("link", { name: `Westlands ${t}` }).last().click();
    await expect(page.getByRole("heading", { name: `Westlands ${t}`, level: 1 })).toBeVisible();

    await page.getByLabel("Day 1 interval 1 opens").fill("10:00");
    await page.getByLabel("Day 1 interval 1 closes").fill("22:00");
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByText("Hours saved.")).toBeVisible();

    await page.getByRole("button", { name: "Open for trading" }).click();
    await expect(page.getByRole("button", { name: "Pause trading" })).toBeVisible();

    const cookEmail = `cook-${t}@retero.test`;
    await page.getByLabel("Email").fill(cookEmail);
    await page.getByLabel("Role").selectOption("kitchen_staff");
    await page.getByRole("button", { name: "Invite" }).click();
    const link = await page.getByLabel("Invitation link").inputValue();
    expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);

    const cook = await browser.newContext();
    const cp = await cook.newPage();
    await cp.goto(new URL(link).pathname);
    await devSignIn(cp, cookEmail, new URL(link).pathname);
    await cp.getByRole("button", { name: "Accept invitation" }).click();
    await cp.getByRole("link", { name: "Go to back of house" }).click();
    await expect(cp.getByRole("link", { name: `Westlands ${t}` }).first()).toBeVisible();
    // The cook cannot reach the platform page.
    const res = await cp.goto("/ops/platform");
    expect(res?.status()).toBe(404);
    await cook.close();
  });

  test("validation errors are shown inline", async ({ page }) => {
    const t = uniq();
    const ownerEmail = `owner2-${t}@retero.test`;
    await devSignIn(page, ownerEmail);
    makePlatformOwner(ownerEmail);
    await page.goto("/ops/platform");
    await page.getByLabel("Name").fill("Bad");
    await page.getByLabel("Slug").fill("Bad Slug!");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(/Lowercase letters/)).toBeVisible();
  });
});
