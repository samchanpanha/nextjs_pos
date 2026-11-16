import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canActorAuthenticateInTenant,
  canStartDemoMode,
  canSwitchToTenant,
  countDemoUsersAcrossTenants,
  getVisibleTenantsForActor,
  isDemoStaffAccount,
  resolveTenantStaffSignIn,
} from './tenantAccess';
import { createSeedState, createTenantSeedState } from '../data/seedData';
import type { TenantSummary } from '../types/pos';

function buildMultiTenants() {
  const demoTenant = createSeedState('restaurant');
  const tenantA = createTenantSeedState({
    businessName: 'Angkor Roastery',
    businessCode: 'ANGKOR_KH',
    businessType: 'cafe',
    ownerName: 'Dara Owner',
    ownerPin: '2468',
    exchangeRate: 4100,
    vatPercent: 10,
    plan: 'daily',
    planDays: 1,
    subscriptionStatus: 'active',
  });
  const tenantB = createTenantSeedState({
    businessName: 'Mekong Spa',
    businessCode: 'MEKONG_KH',
    businessType: 'services',
    ownerName: 'Bopha Owner',
    ownerPin: '5678',
    exchangeRate: 4100,
    vatPercent: 10,
    plan: 'standard',
    planDays: 30,
    subscriptionStatus: 'active',
  });
  const tenantStates = {
    [demoTenant.tenantId!]: demoTenant,
    [tenantA.tenantId!]: tenantA,
    [tenantB.tenantId!]: tenantB,
  };
  const summaries: TenantSummary[] = Object.entries(tenantStates).map(([id, st]) => ({
    id,
    name: st.shopName,
    businessCode: st.businessCode,
    businessType: st.businessType || 'restaurant',
    ownerUid: st.ownerUid,
    isDemoTenant: st.isDemoTenant,
    tenantStatus: st.tenantStatus || 'active',
    plan: st.plan,
    planDaysLeft: st.planDaysLeft,
    subscriptionStatus: st.subscriptionStatus || 'active',
    khqrAccountId: st.branches[0]?.khqrBakongId || '',
    khqrAccountName: st.branches[0]?.khqrAccountName || st.shopName,
    ownerName: st.staff.find((s) => s.role === 'owner')?.name || 'Owner',
    branchCode: st.branches[0]?.code || 'MAIN',
    createdAt: '2026-11-16T00:00:00.000Z',
  }));
  return { demoTenant, tenantA, tenantB, tenantStates, summaries };
}

test('isDemoStaffAccount flags seeded demo staff but never Super Admin or registered tenant owners', () => {
  const { demoTenant, tenantA } = buildMultiTenants();
  const admin = demoTenant.staff.find((s) => s.role === 'admin')!;
  const demoOwner = demoTenant.staff.find((s) => s.username === 'guide_chu')!;
  const demoCashier = demoTenant.staff.find((s) => s.username === 'guide_thungan')!;
  const realOwner = tenantA.staff.find((s) => s.role === 'owner')!;

  assert.equal(isDemoStaffAccount(admin, demoTenant), false);
  assert.equal(isDemoStaffAccount(demoOwner, demoTenant), true);
  assert.equal(isDemoStaffAccount(demoCashier, demoTenant), true);
  assert.equal(isDemoStaffAccount(realOwner, tenantA), false);
});

test('disabling demo users blocks demo staff and demo presets while keeping Admin & real tenants active', () => {
  const { demoTenant, tenantA, tenantStates } = buildMultiTenants();
  const disabledPlatform = { demoUsersDisabled: true };

  assert.equal(canStartDemoMode(disabledPlatform), false);
  assert.equal(canStartDemoMode({ demoUsersDisabled: false }), true);
  assert.equal(countDemoUsersAcrossTenants(tenantStates), 7);

  const demoOwner = demoTenant.staff.find((s) => s.username === 'guide_chu')!;
  const admin = demoTenant.staff.find((s) => s.role === 'admin')!;
  const realOwner = tenantA.staff.find((s) => s.role === 'owner')!;

  assert.equal(
    canActorAuthenticateInTenant({ member: demoOwner, tenant: demoTenant, platform: disabledPlatform }).ok,
    false
  );
  assert.equal(
    canActorAuthenticateInTenant({ member: admin, tenant: demoTenant, platform: disabledPlatform }).ok,
    true
  );
  assert.equal(
    canActorAuthenticateInTenant({ member: realOwner, tenant: tenantA, platform: disabledPlatform }).ok,
    true
  );
});

test('strict tenant data isolation: Admin sees all tenants, non-admin tenants see ONLY their own tenant', () => {
  const { demoTenant, tenantA, tenantB, summaries } = buildMultiTenants();
  const admin = demoTenant.staff.find((s) => s.role === 'admin')!;
  const ownerA = tenantA.staff.find((s) => s.role === 'owner')!;
  const platform = { demoUsersDisabled: false };

  const adminVisible = getVisibleTenantsForActor({
    allTenants: summaries,
    isEnteredPos: true,
    actor: admin,
    activeTenantId: demoTenant.tenantId!,
    platform,
  });
  assert.equal(adminVisible.length, 3);

  const tenantAVisible = getVisibleTenantsForActor({
    allTenants: summaries,
    isEnteredPos: true,
    actor: ownerA,
    activeTenantId: tenantA.tenantId!,
    platform,
  });
  assert.equal(tenantAVisible.length, 1);
  assert.equal(tenantAVisible[0].id, tenantA.tenantId);

  // Unauthenticated Welcome screen hides private registered tenants
  const guestVisible = getVisibleTenantsForActor({
    allTenants: summaries,
    isEnteredPos: false,
    actor: null,
    activeTenantId: demoTenant.tenantId!,
    platform,
  });
  assert.equal(guestVisible.length, 0);

  // Non-admin cannot switch into Tenant B
  assert.equal(
    canSwitchToTenant({
      actor: ownerA,
      targetTenantId: tenantB.tenantId!,
      activeTenantId: tenantA.tenantId!,
      targetTenant: tenantB,
    }),
    false
  );
  assert.equal(
    canSwitchToTenant({
      actor: admin,
      targetTenantId: tenantB.tenantId!,
      activeTenantId: tenantA.tenantId!,
      targetTenant: tenantB,
    }),
    true
  );
});

test('resolveTenantStaffSignIn rejects demo accounts when disabled, allows Admin & tenant code sign-in', () => {
  const { tenantA, tenantStates } = buildMultiTenants();
  const disabledPlatform = { demoUsersDisabled: true };

  // Demo user blocked
  const demoAttempt = resolveTenantStaffSignIn({
    tenantStates,
    activeTenantId: 'tenant_lotus_bkk1',
    username: 'guide_chu',
    pinOrPassword: '1111',
    platform: disabledPlatform,
  });
  assert.equal(demoAttempt.ok, false);

  // Admin succeeds even when demo is disabled
  const adminAttempt = resolveTenantStaffSignIn({
    tenantStates,
    activeTenantId: 'tenant_lotus_bkk1',
    username: 'admin',
    pinOrPassword: '0000',
    platform: disabledPlatform,
  });
  assert.equal(adminAttempt.ok, true);
  assert.equal(adminAttempt.staff?.role, 'admin');

  // Tenant A owner signs in with Tenant Code + credentials -> isolated to Tenant A
  const ownerAttempt = resolveTenantStaffSignIn({
    tenantStates,
    activeTenantId: 'tenant_lotus_bkk1',
    businessCode: 'ANGKOR_KH',
    username: 'owner',
    pinOrPassword: '2468',
    platform: disabledPlatform,
  });
  assert.equal(ownerAttempt.ok, true);
  assert.equal(ownerAttempt.tenantId, tenantA.tenantId);
  assert.equal(ownerAttempt.staff?.role, 'owner');
});
