import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditTenantBranchSettings,
  createDefaultInvoiceTemplate,
  formatInvoiceNumber,
  normalizeInvoiceTemplate,
} from './invoiceTemplate';
import {
  ALL_PERMISSIONS,
  DEFAULT_OWNER_TENANT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from './permissions';
import type { StaffMember } from '../types/pos';

const adminActor: StaffMember = {
  id: 'staff_admin',
  name: 'System Admin',
  username: 'admin',
  roleLabel: 'Super Admin',
  role: 'admin',
  pin: '0000',
  active: true,
  lastSignIn: '2026-11-16',
  permissions: [...ALL_PERMISSIONS],
};

const ownerActor: StaffMember = {
  id: 'staff_owner',
  name: 'Sophea',
  username: 'guide_chu',
  roleLabel: 'Business Owner',
  role: 'owner',
  pin: '1111',
  active: true,
  lastSignIn: '2026-11-16',
  permissions: [...DEFAULT_OWNER_TENANT_PERMISSIONS],
};

const cashierActor: StaffMember = {
  id: 'staff_cashier',
  name: 'Sokha',
  username: 'guide_thungan',
  roleLabel: 'Cashier',
  role: 'cashier',
  pin: '3333',
  active: true,
  lastSignIn: '2026-11-16',
  permissions: [...DEFAULT_ROLE_PERMISSIONS.cashier],
};

test('createDefaultInvoiceTemplate derives tenant prefix, initials, and icon cleanly', () => {
  const tpl = createDefaultInvoiceTemplate({
    shopName: 'Mekong Spice Bistro',
    branchCode: 'msb_01',
    businessType: 'restaurant',
  });
  assert.equal(tpl.invoicePrefix, 'MSB_01');
  assert.equal(tpl.logoText, 'MS');
  assert.equal(tpl.logoIcon, 'monogram');
  assert.equal(tpl.logoImageUrl, '');
  assert.equal(tpl.style, 'thermal_80mm');
  assert.equal(tpl.showVattin, true);

  const serviceTpl = createDefaultInvoiceTemplate({
    shopName: 'Khmerspa Studio',
    branchCode: 'KHM',
    businessType: 'services',
  });
  assert.equal(serviceTpl.style, 'modern_bilingual');
  assert.equal(serviceTpl.logoIcon, 'sparkles');
});

test('normalizeInvoiceTemplate enforces valid styles, company icons, and sanitizes logo URLs', () => {
  const tpl = normalizeInvoiceTemplate(
    {
      style: 'a4_tax_invoice',
      accentColor: 'crimson',
      invoicePrefix: ' bkk1 ',
      headerTitle: 'TAX INVOICE 2026',
      logoIcon: 'coffee',
      logoImageUrl: 'https://example.com/logo.png',
      showKhmerItemNames: false,
      qrFooterMode: 'bakong_khqr',
    },
    { shopName: 'Lotus', branchCode: 'BKK1' }
  );
  assert.equal(tpl.style, 'a4_tax_invoice');
  assert.equal(tpl.accentColor, 'crimson');
  assert.equal(tpl.invoicePrefix, 'BKK1');
  assert.equal(tpl.headerTitle, 'TAX INVOICE 2026');
  assert.equal(tpl.logoIcon, 'coffee');
  assert.equal(tpl.logoImageUrl, 'https://example.com/logo.png');
  assert.equal(tpl.showKhmerItemNames, false);
  assert.equal(tpl.qrFooterMode, 'bakong_khqr');

  // Unsafe schemes or invalid icons are sanitized
  const unsafe = normalizeInvoiceTemplate(
    {
      logoIcon: 'invalid_icon' as never,
      logoImageUrl: 'javascript:alert(1)',
    },
    { shopName: 'Lotus', branchCode: 'BKK1' }
  );
  assert.equal(unsafe.logoIcon, 'monogram');
  assert.equal(unsafe.logoImageUrl, '');
});

test('formatInvoiceNumber formats prefix and zero-padded number', () => {
  assert.equal(formatInvoiceNumber('bkk1', 42), 'BKK1-00042');
  assert.equal(formatInvoiceNumber(undefined, 108), 'INV-00108');
});

test('canEditTenantBranchSettings respects tenant owner boundaries and Super Admin control', () => {
  // Owner can edit their own tenant when holding settings permission
  assert.equal(
    canEditTenantBranchSettings(
      ownerActor,
      'tenant_a',
      'tenant_a',
      DEFAULT_OWNER_TENANT_PERMISSIONS
    ),
    true
  );

  // Owner CANNOT edit another tenant's settings or invoice template
  assert.equal(
    canEditTenantBranchSettings(
      ownerActor,
      'tenant_b',
      'tenant_a',
      DEFAULT_OWNER_TENANT_PERMISSIONS
    ),
    false
  );

  // Owner CANNOT edit even their own tenant if Super Admin revoked 'settings'
  const restrictedPerms = DEFAULT_OWNER_TENANT_PERMISSIONS.filter((p) => p !== 'settings');
  assert.equal(
    canEditTenantBranchSettings(ownerActor, 'tenant_a', 'tenant_a', restrictedPerms),
    false
  );

  // Cashier without 'settings' cannot edit
  assert.equal(
    canEditTenantBranchSettings(
      cashierActor,
      'tenant_a',
      'tenant_a',
      DEFAULT_OWNER_TENANT_PERMISSIONS
    ),
    false
  );

  // Super Admin can edit BOTH own tenant and any other tenant
  assert.equal(
    canEditTenantBranchSettings(adminActor, 'tenant_a', 'tenant_a', restrictedPerms),
    true
  );
  assert.equal(
    canEditTenantBranchSettings(adminActor, 'tenant_b', 'tenant_a', restrictedPerms),
    true
  );
});
