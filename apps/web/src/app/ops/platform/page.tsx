import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, schema } from "@retero/db";
import { rbac } from "@retero/core";
import { requireUser } from "@/server/auth/session";
import { readAs } from "@/server/ops/context";
import { ActionForm, Field, Submit } from "@/components/ops/action-form";
import { InlineAction } from "@/components/ops/forms";
import { PageHeader, Section, Status, Table, TextInput } from "@/components/ops/kit";
import { createBrandAction, setBrandStatusAction } from "../actions";

export const metadata: Metadata = { title: "Platform" };
export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const s = await requireUser("/ops/platform");
  if (!rbac.can(s.actor, "platform.manage", { level: "platform" })) notFound();
  const brands = await readAs(s, (tx) => tx.select().from(schema.brands).orderBy(asc(schema.brands.name)));
  return (
    <>
      <PageHeader title="Platform" kicker="Owner">Brands on the platform.</PageHeader>
      <Section title="Brands">
        <Table head={["Brand", "Slug", "Status", ""]} empty="No brands yet.">
          {brands.map((b) => (
            <tr key={b.id}>
              <td><Link className="font-medium hover:underline" href={`/ops/b/${b.id}`}>{b.name}</Link></td>
              <td className="font-mono text-xs">{b.slug}</td>
              <td><Status value={b.status} /></td>
              <td className="space-x-1 text-right">
                {b.status !== "active" ? <InlineAction action={setBrandStatusAction} fields={{ brandId: b.id, status: "active" }} label="Activate" /> : null}
                {b.status === "active" ? <InlineAction action={setBrandStatusAction} fields={{ brandId: b.id, status: "suspended" }} label="Suspend" variant="danger" /> : null}
              </td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Create a brand">
        <ActionForm action={createBrandAction} className="grid max-w-xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:space-y-0">
                        <Field label="Name" name="name"><TextInput name="name" required /></Field>
              <Field label="Slug" name="slug" hint="Used in URLs"><TextInput name="slug" required pattern="[a-z0-9-]+" /></Field>
              <Submit>Create</Submit>
        </ActionForm>
      </Section>
    </>
  );
}
