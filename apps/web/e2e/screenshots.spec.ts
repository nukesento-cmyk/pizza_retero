import { test } from "@playwright/test";

// Visual capture for design review. Run: SCREENSHOTS=1 pnpm e2e screenshots
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture");

for (const path of ["/", "/styleguide", "/sign-in"]) {
  test(`capture ${path}`, async ({ page }, info) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const name = path === "/" ? "home" : path.slice(1);
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR ?? "test-results"}/${name}-${info.project.name}.png`, fullPage: true });
  });
}
