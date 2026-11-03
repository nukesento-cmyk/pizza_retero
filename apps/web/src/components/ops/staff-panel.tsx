import { staff, rbac } from "@retero/core";
import { Section, Table, Empty } from "./kit";
import { InlineAction, InviteForm } from "./forms";
import { inviteAction, revokeInvitationAction, revokeMembershipAction } from "@/app/ops/actions";
import { readAs, type OpsSession } from "@/server/ops/context";

/** Staff list + invitations for one scope. Rows come through RLS. */
export async function StaffPanel({ session, scope, filter, returnTo }: {
  session: OpsSession; scope: rbac.ResourceScope; filter: { brandId?: string; branchId?: string; franchiseeId?: string }; returnTo: string;
}) {
  const level = scope.level;
  const targetId = scope.level === "branch" ? scope.branchId : scope.level === "franchisee" ? scope.franchiseeId : scope.level === "brand" ? scope.brandId : "";
  const { people, invites, grantable } = await readAs(session, async (tx) => ({
    people: await staff.listStaff(tx, filter),
    invites: await staff.listInvitations(tx, filter),
    grantable: await staff.grantableRoles(tx, session.actor, scope),
  }));
  const scoped = people.filter((p) => p.scope === level);
  return (
    <Section title="Staff" description="People with a role here. Roles at a higher level also apply.">
      <Table head={["Person", "Role", "Since", ""]} empty="Nobody yet.">
        {scoped.map((p) => (
          <tr key={p.membershipId}>
            <td><div className="font-medium">{p.displayName ?? p.email}</div><div className="text-xs text-muted-foreground">{p.email}</div></td>
            <td>{p.roleName}</td>
            <td className="font-mono text-xs">{p.since.toISOString().slice(0, 10)}</td>
            <td className="text-right">
              {rbac.canGrantRole(session.actor, p.rank, scope) && p.userId !== session.user.id ? (
                <InlineAction action={revokeMembershipAction} fields={{ membershipId: p.membershipId, returnTo }} label="Remove" variant="danger" />
              ) : null}
            </td>
          </tr>
        ))}
      </Table>
      {invites.length ? (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending invitations</h3>
          <Table head={["Email", "Role", "Expires", ""]}>
            {invites.filter((i) => i.scope === level).map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td><td>{i.roleName}</td><td className="font-mono text-xs">{i.expiresAt.toISOString().slice(0, 10)}</td>
                <td className="text-right"><InlineAction action={revokeInvitationAction} fields={{ invitationId: i.id, returnTo }} label="Cancel" variant="ghost" /></td>
              </tr>
            ))}
          </Table>
        </div>
      ) : null}
      <div className="mt-4 rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold">Invite someone</h3>
        {grantable.length ? (
          <InviteForm action={inviteAction} level={level} targetId={targetId} roles={grantable.map((r) => ({ key: r.key, name: r.name }))} returnTo={returnTo} />
        ) : <Empty>You can&apos;t grant roles at this level.</Empty>}
      </div>
    </Section>
  );
}
