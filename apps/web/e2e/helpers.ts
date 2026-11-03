import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "../../..");

export const uniq = () => Math.random().toString(36).slice(2, 8);

/** Local-only dev sign-in (D-016). */
export async function devSignIn(page: Page, email: string, next = "/ops") {
  await page.goto(`/dev-sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/dev-sign-in"));
}

/** Bootstrap a platform owner through the supported owner-only script. */
export function makePlatformOwner(email: string) {
  execFileSync("pnpm", ["--filter", "@retero/core", "grant-platform-owner", email], { cwd: ROOT, stdio: "pipe" });
}

/** Run a core script (owner role) and return stdout. */
export function coreScript(name: string, args: string[]) {
  return execFileSync("pnpm", ["--silent", "--filter", "@retero/core", name, ...args], { cwd: ROOT, stdio: "pipe" }).toString();
}
