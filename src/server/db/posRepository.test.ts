import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenantSeedState } from '../../data/seedData';
import { PosSqliteRepository } from './posRepository';
import { createSqliteConnection } from './sqliteDriver';

test('SQLite Multi-Tenant Repository: bootstrap, SaaS Auth, ACID save/load & security invariants', () => {
  const conn = createSqliteConnection(':memory:');
  try {
    const repo = new PosSqliteRepository(conn);

    // 1. Bootstrap seeds Lotus Café BKK1 + Riverside Branch 2
    const demoTenant = repo.loadTenantState('tenant_lotus_bkk1');
    assert.ok(demoTenant, 'Demo tenant seeded in SQLite');
    assert.equal(demoTenant.branches.length, 2);
    assert.ok(
      demoTenant.menuItems.some((m) => m.branchId === 'branch_rvs'),
      'Branch 2 (Riverside) has cloned menu items'
    );
    assert.ok(
      demoTenant.tables.some((t) => t.branchId === 'branch_rvs'),
      'Branch 2 (Riverside) has cloned floor tables'
    );

    // 2. Register SaaS Owner Account & authenticate session token
    const reg = repo.registerAccount({
      email: 'sokha@angkortea.kh',
      password: 'secretPassword123',
      displayName: 'Sokha Owner',
    });
    assert.equal(reg.user.email, 'sokha@angkortea.kh');
    assert.equal(reg.user.role, 'owner');

    const auth = repo.authenticateToken(reg.token);
    assert.ok(auth.user);
    assert.equal(auth.user.uid, reg.user.uid);
    assert.equal(auth.isSuperAdmin, false);

    // 3. Create isolated tenant workspace in SQLite
    const tenantSeed = createTenantSeedState({
      businessName: 'Angkor Tea House',
      businessCode: 'ANGKOR_TEA_01',
      businessType: 'cafe',
      ownerName: 'Sokha',
      ownerPin: '2468',
      exchangeRate: 4100,
      vatPercent: 10,
      ownerUid: reg.user.uid,
    });
    const created = repo.saveTenantState(tenantSeed, {
      auth,
      bypassSecurityControls: true,
    });
    assert.equal(created.subscriptionStatus, 'pending');
    assert.equal(created.planDaysLeft, 0);

    // 4. Enforce security_spec.md §3.3: Non-admin cannot self-escalate plan/subscriptionStatus via saveTenantState
    const spoofAttempt = repo.saveTenantState(
      {
        ...created,
        plan: 'premium',
        planDaysLeft: 365,
        subscriptionStatus: 'active',
        tenantStatus: 'suspended',
      },
      { auth }
    );
    assert.equal(spoofAttempt.plan, 'daily', 'Plan escalation blocked for non-admin');
    assert.equal(
      spoofAttempt.subscriptionStatus,
      'pending',
      'Subscription self-activation blocked on raw state save'
    );
    assert.equal(spoofAttempt.tenantStatus, 'active');

    // 5. Dedicated subscription activation updates plan & records payment ledger
    const activated = repo.activateTenantSubscription({
      tenantId: created.tenantId!,
      plan: 'standard',
      paymentRef: 'BAKONG-998877',
      amountUsd: 27,
      actorUid: reg.user.uid,
      actorName: 'Sokha',
    });
    assert.equal(activated.plan, 'standard');
    assert.equal(activated.subscriptionStatus, 'active');
    assert.equal(activated.planDaysLeft, 30);

    // 6. Enforce security_spec.md §3.4: Audit logs are strictly append-only
    const auditCountBefore = activated.auditLogs.length;
    assert.ok(auditCountBefore >= 2);
    const wipedAttempt = repo.saveTenantState(
      {
        ...activated,
        auditLogs: [],
      },
      { auth }
    );
    assert.equal(
      wipedAttempt.auditLogs.length,
      auditCountBefore,
      'Audit logs cannot be deleted from SQLite'
    );

    // 7. Tenant isolation: another SaaS user cannot see Sokha's private tenant
    const reg2 = repo.registerAccount({
      email: 'other@shop.kh',
      password: 'otherPassword123',
      displayName: 'Other Owner',
    });
    const auth2 = repo.authenticateToken(reg2.token);
    const otherVisible = repo.listAccessibleTenants(auth2);
    assert.equal(
      otherVisible.some((t) => t.tenantId === created.tenantId),
      false,
      'Private tenant hidden from unrelated SaaS owner'
    );

    // 8. Cross-device Staff PIN sign-in works by Business Code
    const pinCheck = repo.verifyTenantStaffPin({
      businessCode: 'ANGKOR_TEA_01',
      username: 'owner',
      pin: '2468',
    });
    assert.equal(pinCheck.ok, true);
    assert.equal(pinCheck.tenant?.tenantId, created.tenantId);

    // 9. Engine stats reflect subscription revenue and new PO/Accounting tables
    const stats = repo.getSqliteEngineStats();
    assert.ok(stats.totalTenants >= 2);
    assert.equal(stats.subscriptionRevenueUsd, 27);
    assert.ok((demoTenant.accounts?.length || 0) >= 20, 'Demo store seeded with Chart of Accounts');
    assert.ok((demoTenant.purchaseOrders?.length || 0) >= 3, 'Demo store seeded with Purchase Orders');
    assert.ok((demoTenant.journalEntries?.length || 0) >= 10, 'Demo store seeded with balanced Journal Entries');

    // 10. Strict Platform-Only Super Admin: operational store data is redacted for Admin,
    //     and Admin governance updates NEVER wipe the tenant's real store data in SQLite!
    const adminLogin = repo.loginAccount({
      email: 'admin@xaiwork.kh',
      password: 'admin1234',
    });
    const adminAuth = repo.authenticateToken(adminLogin.token);
    assert.equal(adminAuth.isSuperAdmin, true);

    const adminTenants = repo.listAccessibleTenants(adminAuth);
    const adminViewOfDemo = adminTenants.find((t) => t.tenantId === 'tenant_lotus_bkk1')!;
    assert.equal(adminViewOfDemo.storeDataRedactedForAdmin, true);
    assert.equal(adminViewOfDemo.orders.length, 0, 'Store orders disabled/redacted for Super Admin');
    assert.equal(adminViewOfDemo.purchaseOrders?.length || 0, 0, 'Store POs disabled/redacted for Super Admin');
    assert.equal(adminViewOfDemo.journalEntries?.length || 0, 0, 'Store Accounting disabled/redacted for Super Admin');

    // Admin updates tenant featureFlags / ownerPermissions using redacted payload -> store data stays 100% intact!
    repo.saveTenantState(
      {
        ...adminViewOfDemo,
        featureFlags: { ...(adminViewOfDemo.featureFlags || {}), accounting: true },
      },
      { auth: adminAuth }
    );
    const reloadedDemoForUser = repo.loadTenantState('tenant_lotus_bkk1')!;
    assert.ok(reloadedDemoForUser.orders.length >= 5, 'Store orders preserved after Admin metadata update');
    assert.ok((reloadedDemoForUser.purchaseOrders?.length || 0) >= 3, 'Store POs preserved after Admin metadata update');
    assert.ok((reloadedDemoForUser.journalEntries?.length || 0) >= 10, 'Store Journal Entries preserved after Admin metadata update');
  } finally {
    conn.close();
  }
});
