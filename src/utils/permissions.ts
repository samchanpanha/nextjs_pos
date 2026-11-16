import type { NavSection, StaffMember, StaffRole } from '../types/pos';

export type PermissionKey =
  | NavSection
  | 'void_discount_override'
  | 'permissions_grant'
  | 'full_admin';

export interface PermissionMeta {
  key: PermissionKey;
  label: string;
  description: string;
  group: 'operations' | 'catalog_stock' | 'finance' | 'admin_settings';
}

export const PERMISSION_DEFINITIONS: PermissionMeta[] = [
  // Operations
  {
    key: 'sell',
    label: 'POS Terminal & Checkout',
    description: 'Take dine-in, takeaway, and delivery orders and collect payments.',
    group: 'operations',
  },
  {
    key: 'todays_money',
    label: "Today's Money",
    description: 'View live shift cash & KHQR takings summary.',
    group: 'operations',
  },
  {
    key: 'reservations',
    label: 'Reservations',
    description: 'Manage table bookings, deposits, and seating.',
    group: 'operations',
  },
  {
    key: 'kds',
    label: 'Kitchen Display (KDS)',
    description: 'View and advance kitchen/bar tickets.',
    group: 'operations',
  },
  {
    key: 'bills',
    label: 'Bills & Receipts',
    description: 'Inspect open/paid bills and reprint receipts.',
    group: 'operations',
  },
  {
    key: 'shift_drawer',
    label: 'Shift & Cash Drawer',
    description: 'Open/close shifts, petty cash, and drawer reconciliation.',
    group: 'operations',
  },
  {
    key: 'void_discount_override',
    label: 'Void & Discount Override',
    description: 'Void sent kitchen items, grant >10%/$5 discounts, and override shift variance.',
    group: 'operations',
  },

  // Catalog & Stock
  {
    key: 'menu_prices',
    label: 'Menu & Prices',
    description: 'Create/edit products, services, images, and pricing.',
    group: 'catalog_stock',
  },
  {
    key: 'stock',
    label: 'Stock & Recipes',
    description: 'Manage ingredients, stock purchases, waste, and BOM recipes.',
    group: 'catalog_stock',
  },
  {
    key: 'purchase_orders',
    label: 'Purchase Orders (PO)',
    description: 'Create supplier POs, auto-draft low-stock restocks, receive GRNs, and pay vendor bills.',
    group: 'catalog_stock',
  },
  {
    key: 'tables_areas',
    label: 'Tables & Areas',
    description: 'Edit floor plan zones, tables, and guest QR links.',
    group: 'catalog_stock',
  },
  {
    key: 'promotion',
    label: 'Promotions & Loyalty',
    description: 'Manage discount rules, prepaid packs, and member points.',
    group: 'catalog_stock',
  },

  // Finance & Compliance
  {
    key: 'accounting',
    label: 'Accounting & Financial Reports',
    description: 'Double-entry ledger, Chart of Accounts, P&L, Balance Sheet, Cash Flow, Trial Balance & GDT Tax.',
    group: 'finance',
  },
  {
    key: 'reports',
    label: 'Analytics & Reports',
    description: 'View revenue, category margin, hourly heatmap, and Z-reports.',
    group: 'finance',
  },
  {
    key: 'sales_book',
    label: 'Sales Book (VAT)',
    description: 'Issue CamInvoice VAT tax invoices and credit notes.',
    group: 'finance',
  },
  {
    key: 'audit_log',
    label: 'Audit Log',
    description: 'Review voids, discounts, and security trail.',
    group: 'finance',
  },

  // Admin, Team & Settings
  {
    key: 'staff',
    label: 'Staff Directory',
    description: 'View and manage team members and 4-digit PINs.',
    group: 'admin_settings',
  },
  {
    key: 'permissions_grant',
    label: 'Grant Staff Permissions',
    description: 'Grant or revoke POS permissions for staff accounts in this tenant.',
    group: 'admin_settings',
  },
  {
    key: 'chain',
    label: 'Tenants & Branches',
    description: 'Switch/add branches and view multi-tenant workspaces.',
    group: 'admin_settings',
  },
  {
    key: 'saas_hub',
    label: 'SQLite & SaaS Modules Hub',
    description: 'Inspect SQLite database health, backups, feature flags, and modular SaaS architecture.',
    group: 'admin_settings',
  },
  {
    key: 'plan_billing',
    label: 'Plan & Billing (KHQR)',
    description: 'Manage Daily ($1/day), Standard, and Premium subscriptions.',
    group: 'admin_settings',
  },
  {
    key: 'settings',
    label: 'Branch & System Settings',
    description: 'Edit exchange rate, VAT, Bakong KHQR setup, and operational rules.',
    group: 'admin_settings',
  },
  {
    key: 'full_admin',
    label: 'Super Admin (Global Grant)',
    description: 'Unrestricted grant control over all tenants, owners, users, and settings.',
    group: 'admin_settings',
  },
];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_DEFINITIONS.map((d) => d.key);

export const OWNER_GRANTABLE_PERMISSIONS: PermissionKey[] = ALL_PERMISSIONS.filter(
  (p) => p !== 'full_admin'
);

export const DEFAULT_OWNER_TENANT_PERMISSIONS: PermissionKey[] = [...OWNER_GRANTABLE_PERMISSIONS];

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, PermissionKey[]> = {
  admin: [...ALL_PERMISSIONS],
  owner: [...DEFAULT_OWNER_TENANT_PERMISSIONS],
  manager: [
    'sell',
    'todays_money',
    'reservations',
    'kds',
    'bills',
    'shift_drawer',
    'reports',
    'accounting',
    'menu_prices',
    'stock',
    'purchase_orders',
    'tables_areas',
    'promotion',
    'sales_book',
    'audit_log',
    'void_discount_override',
  ],
  cashier: ['sell', 'todays_money', 'reservations', 'bills', 'shift_drawer'],
  waiter: ['sell', 'reservations', 'tables_areas'],
  kitchen: ['kds'],
  runner: ['sell', 'kds'],
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Super Admin',
  owner: 'Business Owner',
  manager: 'Store Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
  kitchen: 'Kitchen / Bar',
  runner: 'Runner',
};

const VALID_PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function normalizePermissions(
  list: unknown,
  allowFullAdmin = false
): PermissionKey[] {
  if (!Array.isArray(list)) return [];
  const deduped: PermissionKey[] = [];
  for (const item of list) {
    if (typeof item !== 'string' || !VALID_PERMISSION_SET.has(item)) continue;
    if (!allowFullAdmin && item === 'full_admin') continue;
    const key = item as PermissionKey;
    if (!deduped.includes(key)) {
      deduped.push(key);
    }
  }
  return deduped;
}

export function isSuperAdmin(member?: Pick<StaffMember, 'role' | 'active'> | null): boolean {
  return Boolean(member && member.active && member.role === 'admin');
}

/**
 * Resolves the active effective permissions for a staff member inside a tenant.
 * - `admin` ALWAYS holds every permission including `full_admin`.
 * - `owner` uses `tenantOwnerPermissions` (if configured by Super Admin), or falls back
 *   to `member.permissions`, or `DEFAULT_OWNER_TENANT_PERMISSIONS`.
 * - Staff roles (`manager`, `cashier`, `waiter`, `kitchen`, `runner`) use their explicit
 *   `member.permissions` if present, otherwise `DEFAULT_ROLE_PERMISSIONS[role]`.
 */
export function getEffectivePermissions(
  member?: Pick<StaffMember, 'role' | 'active' | 'permissions'> | null,
  tenantOwnerPermissions?: PermissionKey[]
): PermissionKey[] {
  if (!member || !member.active) return [];
  if (member.role === 'admin') {
    return [...ALL_PERMISSIONS];
  }
  if (member.role === 'owner') {
    const raw =
      Array.isArray(tenantOwnerPermissions)
        ? tenantOwnerPermissions
        : Array.isArray(member.permissions)
          ? member.permissions
          : DEFAULT_OWNER_TENANT_PERMISSIONS;
    return normalizePermissions(raw, false);
  }
  const raw = Array.isArray(member.permissions)
    ? member.permissions
    : DEFAULT_ROLE_PERMISSIONS[member.role] || [];
  return normalizePermissions(raw, false);
}

export function hasPermission(
  member: Pick<StaffMember, 'role' | 'active' | 'permissions'> | null | undefined,
  perm: PermissionKey,
  tenantOwnerPermissions?: PermissionKey[]
): boolean {
  if (!member || !member.active) return false;
  if (member.role === 'admin') return true;
  return getEffectivePermissions(member, tenantOwnerPermissions).includes(perm);
}

/**
 * Strict Platform-Only Super Admin Plane:
 * Super Admin (`role === 'admin'`) manages SaaS infrastructure, tenant lifecycle,
 * role/owner permission grants, and SQLite health ONLY.
 * Store operational data (POS orders, KDS, inventory, POs, accounting ledgers, bills)
 * is strictly disabled on Super Admin accounts for tenant privacy.
 */
export const ADMIN_PLATFORM_NAV_SECTIONS: NavSection[] = [
  'saas_hub',
  'chain',
  'staff',
  'settings',
];

const ADMIN_PLATFORM_NAV_SET = new Set<NavSection>(ADMIN_PLATFORM_NAV_SECTIONS);

export function isPlatformOnlyAdmin(
  member?: Pick<StaffMember, 'role' | 'active'> | null
): boolean {
  return isSuperAdmin(member);
}

export function canAccessNavSection(
  member: Pick<StaffMember, 'role' | 'active' | 'permissions'> | null | undefined,
  section: NavSection,
  tenantOwnerPermissions?: PermissionKey[]
): boolean {
  if (!member || !member.active) return false;
  if (member.role === 'admin') {
    return ADMIN_PLATFORM_NAV_SET.has(section);
  }
  return hasPermission(member, section, tenantOwnerPermissions);
}

export function canEditSettings(
  member: Pick<StaffMember, 'role' | 'active' | 'permissions'> | null | undefined,
  tenantOwnerPermissions?: PermissionKey[]
): boolean {
  if (!member || !member.active) return false;
  if (member.role === 'admin') return true;
  return hasPermission(member, 'settings', tenantOwnerPermissions);
}

/**
 * Determines whether `actor` can grant or revoke `perm` on `targetMember`.
 * - Super Admin (`admin`): can grant/revoke any non-`full_admin` permission for Owners and Staff across all tenants.
 * - Cannot downgrade or strip permissions from another `admin` (admin permissions are always full).
 * - Tenant Owner (or delegated user with `permissions_grant`): can grant/revoke permissions ONLY for
 *   non-admin/non-owner staff members, and ONLY permissions the actor themselves holds.
 */
export function canGrantPermission(
  actor: Pick<StaffMember, 'role' | 'active' | 'permissions'> | null | undefined,
  targetMember: Pick<StaffMember, 'role'> | null | undefined,
  perm: PermissionKey,
  actorTenantOwnerPermissions?: PermissionKey[]
): boolean {
  if (!actor || !actor.active || !targetMember) return false;
  if (targetMember.role === 'admin') return false;
  if (perm === 'full_admin') return false;

  if (actor.role === 'admin') {
    return true;
  }

  // Non-admins cannot alter an Owner's permissions (only Super Admin can grant/revoke Owner permissions)
  if (targetMember.role === 'owner') return false;

  if (!hasPermission(actor, 'permissions_grant', actorTenantOwnerPermissions)) {
    return false;
  }

  // Actor can only grant permissions they themselves possess
  return hasPermission(actor, perm, actorTenantOwnerPermissions);
}

export function canManageOwnerGrants(
  actor: Pick<StaffMember, 'role' | 'active'> | null | undefined
): boolean {
  return isSuperAdmin(actor);
}

export function canAssignRole(
  actor: Pick<StaffMember, 'role' | 'active' | 'permissions'> | null | undefined,
  roleToAssign: StaffRole,
  actorTenantOwnerPermissions?: PermissionKey[]
): boolean {
  if (!actor || !actor.active) return false;
  if (actor.role === 'admin') return true;
  if (roleToAssign === 'admin' || roleToAssign === 'owner') return false;
  return hasPermission(actor, 'staff', actorTenantOwnerPermissions);
}

const NAV_PRIORITY: NavSection[] = [
  'sell',
  'kds',
  'todays_money',
  'bills',
  'reservations',
  'shift_drawer',
  'accounting',
  'reports',
  'menu_prices',
  'stock',
  'purchase_orders',
  'tables_areas',
  'promotion',
  'sales_book',
  'staff',
  'chain',
  'saas_hub',
  'audit_log',
  'plan_billing',
  'settings',
];

export function getFirstAllowedNavSection(
  member: Pick<StaffMember, 'role' | 'active' | 'permissions'> | null | undefined,
  tenantOwnerPermissions?: PermissionKey[]
): NavSection {
  if (isSuperAdmin(member)) {
    return 'saas_hub';
  }
  for (const sec of NAV_PRIORITY) {
    if (canAccessNavSection(member, sec, tenantOwnerPermissions)) {
      return sec;
    }
  }
  return 'sell';
}
