"use server";

import { headers } from "next/headers";
import { brands, domains, franchise, staff } from "@retero/core";
import { act, formObject, type ActionState } from "@/server/action";

/* Thin adapters: FormData → core. All authorization happens in core + RLS. */

export async function createBrandAction(_: ActionState, fd: FormData) {
  return act(async ({ tx, actor }) => {
    const b = await brands.createBrand(tx, actor, formObject(fd));
    return { message: `Brand ${b.name} created (pending).` };
  }, { revalidate: "/ops/platform" });
}

export async function setBrandStatusAction(_: ActionState, fd: FormData) {
  return act(async ({ tx, actor }) => {
    await brands.updateBrand(tx, actor, formObject(fd));
    return { message: "Status updated." };
  }, { revalidate: "/ops/platform" });
}

export async function updateBrandSettingsAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  const colors = Object.fromEntries(
    ["sauce", "crust", "oven", "basil", "dough", "espresso"].flatMap((k) => (o[`color_${k}`] ? [[k, o[`color_${k}`]]] : [])),
  );
  return act(async ({ tx, actor }) => {
    await brands.updateBrandSettings(tx, actor, {
      brandId: o.brandId,
      whatsappNumber: o.whatsappNumber ?? null,
      supportEmail: o.supportEmail ?? null,
      timezone: o.timezone,
      theme: Object.keys(colors).length ? { colors } : undefined,
    });
    if (o.name) await brands.updateBrand(tx, actor, { brandId: o.brandId, name: o.name });
    return { message: "Saved." };
  }, { revalidate: `/ops/b/${String(o.brandId)}/settings` });
}

export async function createFranchiseeAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    const f = await franchise.createFranchisee(tx, actor, o);
    return { message: `${f.tradingName} onboarded.` };
  }, { revalidate: `/ops/b/${String(o.brandId)}` });
}

export async function updateFranchiseeAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await franchise.updateFranchisee(tx, actor, o);
    return { message: "Saved." };
  }, { revalidate: `/ops/f/${String(o.franchiseeId)}` });
}

export async function createBranchAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    const b = await franchise.createBranch(tx, actor, {
      ...o, offersDelivery: o.offersDelivery === true, offersCollection: o.offersCollection === true,
    });
    return { message: `Branch ${b.name} created (pending).`, data: { id: b.id } };
  }, { revalidate: `/ops/f/${String(o.franchiseeId)}` });
}

export async function updateBranchAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await franchise.updateBranch(tx, actor, {
      ...o,
      ...(fd.has("offersDeliveryPresent") ? { offersDelivery: o.offersDelivery === true, offersCollection: o.offersCollection === true } : {}),
    });
    return { message: "Saved." };
  }, { revalidate: `/ops/br/${String(o.branchId)}` });
}

export async function setBranchHoursAction(_: ActionState, fd: FormData) {
  const branchId = String(fd.get("branchId"));
  const week: { dayOfWeek: number; opensAt: string; closesAt: string }[] = [];
  for (let d = 0; d < 7; d++) {
    for (let slot = 0; slot < 2; slot++) {
      const o = String(fd.get(`d${d}s${slot}o`) ?? ""), c = String(fd.get(`d${d}s${slot}c`) ?? "");
      if (o && c) week.push({ dayOfWeek: d, opensAt: o, closesAt: c });
    }
  }
  return act(async ({ tx, actor }) => {
    await franchise.setBranchHours(tx, actor, { branchId, week });
    return { message: "Hours saved." };
  }, { revalidate: `/ops/br/${branchId}` });
}

export async function addClosureAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await franchise.addClosure(tx, actor, o);
    return { message: "Closure added." };
  }, { revalidate: `/ops/br/${String(o.branchId)}` });
}

export async function addDomainAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    const target = String(o.target ?? "brand");
    const [kind, id] = target.split(":");
    const r = await domains.addDomain(tx, actor, {
      brandId: o.brandId, hostname: o.hostname,
      franchiseeId: kind === "franchisee" ? id : null, branchId: kind === "branch" ? id : null,
    });
    return { message: `Added. Publish TXT ${r.txtRecord.name} = ${r.txtRecord.value}, then verify.` };
  }, { revalidate: `/ops/b/${String(o.brandId)}/domains` });
}

export async function domainOpAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    const id = String(o.domainId);
    if (o.op === "verify") await domains.verifyDomain(tx, actor, id);
    else if (o.op === "primary") await domains.setPrimaryDomain(tx, actor, id);
    else if (o.op === "remove") await domains.removeDomain(tx, actor, id);
    return { message: "Done." };
  }, { revalidate: `/ops/b/${String(o.brandId)}/domains` });
}

export async function inviteAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return act(async ({ tx, actor, requestId }) => {
    const r = await staff.inviteStaff(tx, actor, {
      email: o.email, roleKey: o.roleKey, target: { level: o.level, id: o.targetId },
    }, { requestId });
    // No email provider yet (Q8): the inviter shares the link. It is shown once.
    return { message: "Invitation created. Share this link. It is shown once and expires in 7 days.", data: { link: `${origin}/invite/${r.token}` } };
  }, { revalidate: String(o.returnTo ?? "/ops") });
}

export async function revokeMembershipAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await staff.revokeMembership(tx, actor, String(o.membershipId));
    return { message: "Access removed." };
  }, { revalidate: String(o.returnTo ?? "/ops") });
}

export async function revokeInvitationAction(_: ActionState, fd: FormData) {
  const o = formObject(fd);
  return act(async ({ tx, actor }) => {
    await staff.revokeInvitation(tx, actor, String(o.invitationId));
    return { message: "Invitation cancelled." };
  }, { revalidate: String(o.returnTo ?? "/ops") });
}

export async function acceptInvitationAction(_: ActionState, fd: FormData) {
  return act(async ({ tx, actor }) => {
    await staff.acceptInvitation(tx, actor, String(fd.get("token")));
    return { message: "Welcome aboard." };
  }, { revalidate: "/ops" });
}

export type { ActionState };
