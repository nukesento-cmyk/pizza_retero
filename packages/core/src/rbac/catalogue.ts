import type { ScopeType } from "./types";

/**
 * Permission catalogue — the single source of truth. `pnpm db:seed` mirrors
 * it into the permissions/roles/role_permissions tables so SQL policies can
 * check the same rules (defence in depth).
 */
export const PERMISSIONS = {
  "platform.manage": "Operate the platform itself",
  "brand.create": "Create brands",
  "brand.read": "View non-public brand records",
  "brand.update": "Edit brand details",
  "brand.settings.update": "Edit brand settings and theme",
  "franchisee.create": "Onboard franchisees",
  "franchisee.read": "View franchisee records",
  "franchisee.update": "Edit franchisee records",
  "branch.create": "Open branches",
  "branch.read": "View non-public branch records",
  "branch.update": "Edit branch details, hours and zones",
  "domain.manage": "Manage domains",
  "staff.read": "View staff and their roles",
  "staff.invite": "Grant roles to staff",
  "audit.read": "View audit logs",
  "catalogue.manage": "Manage the brand catalogue",
  "branch.menu.manage": "Manage branch availability and pricing",
  "order.read": "View orders",
  "order.manage": "Create and change orders, including staff-assisted orders",
  "order.refund": "Issue refunds",
  "kitchen.ticket.update": "Move kitchen tickets through the workflow",
  "inventory.read": "View stock",
  "inventory.manage": "Record stock movements and waste",
  "delivery.read": "View deliveries",
  "delivery.update": "Update delivery status",
  "customer.read": "View customer details",
  "report.read": "View sales reports",
} as const satisfies Record<string, string>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export interface RoleDefinition {
  key: string;
  name: string;
  scope: ScopeType;
  rank: number;
  permissions: readonly Permission[];
}

const BRANCH_OPS: Permission[] = [
  "branch.read", "branch.update", "staff.read", "staff.invite", "audit.read",
  "branch.menu.manage", "order.read", "order.manage", "order.refund",
  "kitchen.ticket.update", "inventory.read", "inventory.manage",
  "delivery.read", "delivery.update", "customer.read", "report.read",
];

export const SYSTEM_ROLES = [
  {
    key: "platform_owner", name: "Platform owner", scope: "platform", rank: 100,
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "brand_admin", name: "Brand administrator", scope: "brand", rank: 80,
    permissions: ALL_PERMISSIONS.filter((p) => p !== "platform.manage" && p !== "brand.create"),
  },
  {
    key: "franchise_admin", name: "Franchise administrator", scope: "franchisee", rank: 60,
    // Branches are opened by the brand (D-011); franchise admins run them.
    permissions: ["franchisee.read", ...BRANCH_OPS],
  },
  {
    key: "branch_manager", name: "Branch manager", scope: "branch", rank: 40,
    permissions: BRANCH_OPS.filter((p) => p !== "order.refund"),
  },
  {
    key: "inventory_manager", name: "Inventory manager", scope: "branch", rank: 20,
    permissions: ["branch.read", "inventory.read", "inventory.manage"],
  },
  {
    key: "kitchen_staff", name: "Kitchen staff", scope: "branch", rank: 10,
    permissions: ["branch.read", "order.read", "kitchen.ticket.update", "inventory.read"],
  },
  {
    key: "delivery_staff", name: "Delivery staff", scope: "branch", rank: 10,
    permissions: ["branch.read", "delivery.read", "delivery.update"],
  },
] as const satisfies readonly RoleDefinition[];

export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]["key"];

export function getRole(key: string): RoleDefinition | undefined {
  return SYSTEM_ROLES.find((r) => r.key === key);
}
