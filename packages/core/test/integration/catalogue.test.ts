import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, withActor, type Tx } from "@retero/db";
import { AppError } from "@retero/shared/errors";
import { loadActor } from "../../src/identity";
import { getBranchMenu, importCatalogue, readTemplate, setBranchOptionOverride, setBranchProductAvailability, setBranchVariantPrice, upsertVariant } from "../../src/catalogue";
import { priceLine } from "../../src/pricing";
import { expectDbError, grant, makeBrandTree, makeUser, openDbs } from "../../../../test/fixtures";

const dbs = openDbs();
const { owner, app } = dbs;
afterAll(() => dbs.close());

let A: Awaited<ReturnType<typeof makeBrandTree>>;
let B: Awaited<ReturnType<typeof makeBrandTree>>;
let brandAdmin: string, managerA1: string;

const as = <T>(u: string, fn: (tx: Tx, a: Awaited<ReturnType<typeof loadActor>>) => Promise<T>) => withActor(app, u, async (tx) => fn(tx, await loadActor(tx, u)));
const code = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return e instanceof AppError ? e.code : String(e); } };

beforeAll(async () => {
  A = await makeBrandTree(owner);
  B = await makeBrandTree(owner);
  await owner.insert(schema.brandSettings).values([{ brandId: A.brand.id }, { brandId: B.brand.id }]);
  brandAdmin = await makeUser(owner, "cat-admin");
  managerA1 = await makeUser(owner, "cat-mgr");
  await grant(owner, brandAdmin, "brand_admin", { brandId: A.brand.id });
  await grant(owner, managerA1, "branch_manager", { brandId: A.brand.id, branchId: A.b1.id });
  const tpl = await readTemplate(new URL("../../templates/starter-menu.json", import.meta.url).pathname);
  await as(brandAdmin, (tx, a) => importCatalogue(tx, a, A.brand.id, tpl, { publish: true }));
});

describe("catalogue", () => {
  it("anonymous visitors read the branch menu with allergens and diet flags", async () => {
    const menu = await withActor(app, null, (tx) => getBranchMenu(tx, A.b1.id));
    const marg = menu.products.find((p) => p.slug === "margherita")!;
    expect(marg.available).toBe(true);
    expect(marg.variants.map((v) => v.priceMinor)).toEqual([65000n, 95000n, 145000n]);
    expect(marg.allergens).toEqual(["gluten"]);
    const line = priceLine(menu, { productId: marg.id, variantId: marg.variants[1]!.id, quantity: 1 });
    expect(line.ok && line.line.allergens).toEqual(["gluten", "milk"]);
  });

  it("branch manager overrides price within bounds; outside bounds is refused by core AND the database", async () => {
    const menu = await withActor(app, null, (tx) => getBranchMenu(tx, A.b1.id));
    const classic = menu.products.find((p) => p.slug === "margherita")!.variants[1]!;
    await as(managerA1, (tx, a) => setBranchVariantPrice(tx, a, { branchId: A.b1.id, variantId: classic.id, priceMinor: 100000n }));
    const after = await withActor(app, null, (tx) => getBranchMenu(tx, A.b1.id));
    expect(after.products.find((p) => p.slug === "margherita")!.variants[1]!.priceMinor).toBe(100000n);
    // Other branches keep the brand price (b2 is pending, so read it as staff; RLS hides it from the public).
    const other = await withActor(app, brandAdmin, (tx) => getBranchMenu(tx, A.b2.id));
    expect(other.products.find((p) => p.slug === "margherita")!.variants[1]!.priceMinor).toBe(95000n);

    expect(await code(as(managerA1, (tx, a) => setBranchVariantPrice(tx, a, { branchId: A.b1.id, variantId: classic.id, priceMinor: 500000n })))).toBe("VALIDATION_FAILED");
    await expectDbError(
      withActor(app, managerA1, (tx) => tx.update(schema.branchVariantPrices).set({ priceMinor: 500000n })),
      /outside brand bounds/,
    );
  });

  it("KES prices must be whole shillings (M-Pesa)", async () => {
    const menu = await withActor(app, null, (tx) => getBranchMenu(tx, A.b1.id));
    const soda = menu.products.find((p) => p.slug === "soda")!;
    expect(await code(as(brandAdmin, (tx, a) => upsertVariant(tx, a, { productId: soda.id, code: "can", name: "Can", priceMinor: 15050n })))).toBe("VALIDATION_FAILED");
  });

  it("sold-out options and unavailable products flow into pricing", async () => {
    const menu = await withActor(app, null, (tx) => getBranchMenu(tx, A.b1.id));
    const pepperoni = Object.values(menu.options).find((o) => o.code === "pepperoni")!;
    const garden = menu.products.find((p) => p.slug === "garden")!;
    await as(managerA1, (tx, a) => setBranchOptionOverride(tx, a, { branchId: A.b1.id, optionId: pepperoni.id, isAvailable: false }));
    await as(managerA1, (tx, a) => setBranchProductAvailability(tx, a, { branchId: A.b1.id, productId: garden.id, isAvailable: false }));
    const m2 = await withActor(app, null, (tx) => getBranchMenu(tx, A.b1.id));
    const marg = m2.products.find((p) => p.slug === "margherita")!;
    const r = priceLine(m2, { productId: marg.id, variantId: marg.variants[0]!.id, optionIds: [pepperoni.id], quantity: 1 });
    expect(r.ok ? "OK" : r.error).toBe("OPTION_UNAVAILABLE");
    expect(m2.products.find((p) => p.slug === "garden")!.available).toBe(false);
  });

  it("cross-tenant: managers can't touch other branches; brand A can't edit brand B's catalogue", async () => {
    const menu = await withActor(app, null, (tx) => getBranchMenu(tx, A.b1.id));
    const v = menu.products[0]!.variants[0]!;
    expect(await code(as(managerA1, (tx, a) => setBranchVariantPrice(tx, a, { branchId: A.b2.id, variantId: v.id, priceMinor: 70000n })))).toBe("NOT_FOUND");
    await expectDbError(
      withActor(app, brandAdmin, (tx) => tx.insert(schema.products).values({ brandId: B.brand.id, slug: "evil", name: "Evil" })),
      /row-level security/,
    );
    // B branch can't price A's variants (composite FK: brand mismatch).
    await expectDbError(
      owner.insert(schema.branchVariantPrices).values({ brandId: B.brand.id, branchId: B.b1.id, variantId: v.id, priceMinor: v.priceMinor }),
      /bvp_variant_fk/,
    );
  });

  it("draft products are hidden from the public", async () => {
    await owner.insert(schema.products).values({ brandId: A.brand.id, slug: "secret", name: "Secret", status: "draft" });
    const visible = await withActor(app, null, (tx) => tx.select().from(schema.products));
    expect(visible.some((p) => p.slug === "secret")).toBe(false);
  });
});
