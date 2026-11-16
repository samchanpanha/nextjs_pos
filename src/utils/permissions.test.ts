import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PERMISSIONS,
  canAccessNavSection,
  canAssignRole,
  canEditSettings,
  canGrantPermission,
  canManageOwnerGrants,
  DEFAULT_OWNER_TENANT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
  getFirstAllowedNavSection,
  hasPermission,
  OWNER_GRANTABLE_PERMISSIONS,
} from './permissions.ts';
import type { StaffMember } from '../types/pos.ts';

const adminUser: StaffMember = {
  id: 'staff_admin',
  name: 'System Admin',
  username: 'admin',
  roleLabel: 'Super Admin',
  role: 'admin',
  pin: '0000',
  active: true,
  lastSignIn: '2026-11-16 08:00',
};

const ownerUser: StaffMember = {
  id: 'staff_owner',
  name: 'Sophea',
  username: 'guide_chu',
  roleLabel: 'Business Owner',
  role: 'owner',
  pin: '1111',
  active: true,
  lastSignIn: '2026-11-16 08:00',
};

const cashierUser: StaffMember = {
  id: 'staff_cashier',
  name: 'Sokha',
  username: 'guide_thungan',
  roleLabel: 'Cashier',
  role: 'cashier',
  pin: '3333',
  active: true,
  lastSignIn: '2026-11-16 08:00',
};

const kitchenUser: StaffMember = {
  id: 'staff_kitchen',
  name: 'Bopha',
  username: 'guide_bep',
  roleLabel: 'Kitchen',
  role: 'kitchen',
  pin: '5555',
  active: true,
  lastSignIn: '2026-11-16 08:00',
};

test('Super Admin always holds full permissions including full_admin and settings', () => {
  const perms = getEffectivePermissions(adminUser, ['sell']);
  assert.deepEqual(perms, ALL_PERMISSIONS);
  assert.equal(hasPermission(adminUser, 'full_admin', ['sell']), true);
  assert.equal(canEditSettings(adminUser, ['sell']), true);
  assert.equal(canManageOwnerGrants(adminUser), true);
  assert.equal(canAssignRole(adminUser, 'owner'), true);
  assert.equal(canAssignRole(adminUser, 'admin'), true);
});

test('Owner permissions respect tenant ownerPermissions granted by Admin', () => {
  // Default owner gets all non-full_admin permissions
  const defaultPerms = getEffectivePermissions(ownerUser);
  assert.deepEqual(defaultPerms, DEFAULT_OWNER_TENANT_PERMISSIONS);
  assert.equal(hasPermission(ownerUser, 'full_admin'), false);
  assert.equal(canEditSettings(ownerUser), true);

  // Admin restricts owner of a tenant to sell + bills + reports (revoking settings & permissions_grant)
  const restrictedOwnerGrants = ['sell', 'bills', 'reports'] as const;
  assert.equal(
    canEditSettings(ownerUser, [...restrictedOwnerGrants]),
    false,
    'Owner loses settings access when Admin revokes settings grant'
  );
  assert.equal(
    canAccessNavSection(ownerUser, 'reports', [...restrictedOwnerGrants]),
    true
  );
  assert.equal(
    canGrantPermission(ownerUser, cashierUser, 'bills', [...restrictedOwnerGrants]),
    false,
    'Owner cannot grant staff permissions when permissions_grant is revoked by Admin'
  );
});

test('Owner with permissions_grant can grant staff permissions up to own granted pool, never escalate Owner or Admin', () => {
  const ownerPool = ['sell', 'bills', 'reports', 'staff', 'permissions_grant'] as const;

  // Allowed: owner holds 'reports' and 'permissions_grant'
  assert.equal(
    canGrantPermission(ownerUser, cashierUser, 'reports', [...ownerPool]),
    true
  );
  // Disallowed: owner does not hold 'settings'
  assert.equal(
    canGrantPermission(ownerUser, cashierUser, 'settings', [...ownerPool]),
    false
  );
  // Disallowed: owner cannot modify another owner or admin or grant full_admin
  assert.equal(
    canGrantPermission(ownerUser, ownerUser, 'sell', [...ownerPool]),
    false
  );
  assert.equal(
    canGrantPermission(ownerUser, adminUser, 'sell', [...ownerPool]),
    false
  );
  assert.equal(
    canGrantPermission(ownerUser, cashierUser, 'full_admin', [...ownerPool]),
    false
  );
  assert.equal(canAssignRole(ownerUser, 'admin', [...ownerPool]), false);
  assert.equal(canAssignRole(ownerUser, 'owner', [...ownerPool]), false);
  assert.equal(canAssignRole(ownerUser, 'cashier', [...ownerPool]), true);
});

test('Admin can grant/revoke any non-full_admin permission for Owners and Staff', () => {
  for (const perm of OWNER_GRANTABLE_PERMISSIONS) {
    assert.equal(canGrantPermission(adminUser, ownerUser, perm), true);
    assert.equal(canGrantPermission(adminUser, cashierUser, perm), true);
  }
  // Admin immutable
  assert.equal(canGrantPermission(adminUser, adminUser, 'sell'), false);
});

test('Inactive user has zero effective permissions', () => {
  const disabledOwner: StaffMember = { ...ownerUser, active: false };
  assert.deepEqual(getEffectivePermissions(disabledOwner), []);
  assert.equal(hasPermission(disabledOwner, 'sell'), false);
  assert.equal(canGrantPermission(disabledOwner, cashierUser, 'sell'), false);
});

test('Kitchen default permissions land on kds first and restrict settings', () => {
  assert.deepEqual(getEffectivePermissions(kitchenUser), DEFAULT_ROLE_PERMISSIONS.kitchen);
  assert.equal(canAccessNavSection(kitchenUser, 'kds'), true);
  assert.equal(canAccessNavSection(kitchenUser, 'settings'), false);
  assert.equal(getFirstAllowedNavSection(kitchenUser), 'kds');
});
