import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  BranchConfig,
  Ingredient,
  MenuItem,
  PosOrder,
  PurchaseOrder,
  Recipe,
  Supplier,
} from '../types/pos';
import {
  buildStockMonitorPayload,
  normalizeAiStockMonitorReport,
  type AiStockMonitorReport,
} from './aiStockMonitor';
import {
  buildAutoRestockDraft,
  buildMailtoUrl,
  computeRestockOrderPacks,
  formatRestockPacks,
} from './autoRestock';

const branch: BranchConfig = {
  id: 'b1',
  name: 'Lotus Café',
  code: 'LOTUS',
  address: '12 Street 240, Phnom Penh',
  phone: '012 345 678',
  vattin: 'L001-900000001',
  exchangeRate: 4100,
  rielRounding: 100,
  simpleMode: false,
  reservationsEnabled: false,
  defaultDepositUsd: 0,
  holdMinutes: 30,
  allowOnlineBooking: false,
  qrMode: 'review',
  groupOrderEnabled: false,
  kdsWarnMinutes: 8,
  kdsLateMinutes: 15,
  blindClose: false,
  varianceLimitUsd: 5,
  khqrAccountName: '',
  khqrBakongId: '',
  bakongConnected: false,
  pointsEnabled: false,
  pointsPerDollar: 1,
  pointsValuePer100: 1,
  telegramBotConnected: false,
  telegramChannel: '',
  displayPairingCode: '',
  displayFeaturedMode: 'auto',
  displayShowNewPage: false,
  printerAutoBrowser: false,
  vatPercent: 10,
  serviceChargePercent: 0,
};

const ingredients: Ingredient[] = [
  {
    id: 'ing_tea',
    branchId: 'b1',
    nameEn: 'Black tea leaves',
    nameKh: 'ស្លឹកតែខ្មៅ',
    unit: 'g',
    purchaseUnit: '500g bag',
    purchaseUnitSize: 500,
    onHand: 180,
    minLevel: 300,
    used7d: 210,
    avgCostUsd: 0.014,
  },
  {
    id: 'ing_milk',
    branchId: 'b1',
    nameEn: 'Fresh milk',
    nameKh: 'ទឹកដោះគោស្រស់',
    unit: 'ml',
    purchaseUnit: '1L carton',
    purchaseUnitSize: 1000,
    onHand: 1600,
    minLevel: 500,
    used7d: 2800,
    avgCostUsd: 0.002,
  },
  {
    id: 'ing_beans',
    branchId: 'b1',
    nameEn: 'Coffee beans',
    nameKh: 'គ្រាប់កាហ្វេ',
    unit: 'g',
    purchaseUnit: '1kg bag',
    purchaseUnitSize: 1000,
    onHand: 5000,
    minLevel: 1000,
    used7d: 700,
    avgCostUsd: 0.012,
  },
];

const suppliers: Supplier[] = [
  {
    id: 'sup_coffee',
    branchId: 'all',
    name: 'Mekong Specialty Coffee Roasters',
    category: 'Coffee & Tea',
    contactName: 'Sokchea Meas',
    phone: '012 889 112',
    email: 'orders@mekong.example',
    vattin: 'L001-901234567',
    paymentTerms: 'net_15',
    active: true,
    createdAt: '2026-10-01T08:00:00Z',
  },
  {
    id: 'sup_dairy',
    branchId: 'all',
    name: 'Angkor Dairy & Beverage Supply',
    category: 'Dairy & Beverage',
    contactName: 'Rithy Phan',
    phone: '098 221 909',
    email: 'sales@angkor.example',
    paymentTerms: 'net_7',
    active: true,
    createdAt: '2026-10-01T08:00:00Z',
  },
];

const menu: MenuItem[] = [
  {
    id: 'm_latte',
    branchId: 'b1',
    nameEn: 'Iced Latte',
    nameKh: 'ឡាតេ',
    nameVi: 'Latte',
    category: 'Coffee',
    priceUsd: 3.5,
    station: 'bar',
    initials: 'IL',
    active: true,
  },
];

const recipes: Recipe[] = [
  {
    menuItemId: 'm_latte',
    lines: [
      { ingredientId: 'ing_beans', qtyPerPortion: 20 },
      { ingredientId: 'ing_milk', qtyPerPortion: 200 },
    ],
  },
];

const orders: PosOrder[] = [
  {
    id: 'o1',
    branchId: 'b1',
    orderNumber: 101,
    tableName: 'T01',
    channel: 'dine_in',
    status: 'paid',
    guests: 2,
    items: [
      {
        id: 'li1',
        menuItemId: 'm_latte',
        nameEn: 'Iced Latte',
        nameKh: 'ឡាតេ',
        nameVi: 'Latte',
        unitPriceUsd: 3.5,
        qty: 3,
        station: 'bar',
        category: 'Coffee',
        round: 1,
        sentToKitchen: true,
        kdsStatus: 'served',
      },
    ],
    currentRound: 1,
    manualDiscountPercent: 0,
    manualDiscountUsd: 0,
    promoDiscountUsd: 0,
    pointsRedeemed: 0,
    depositAppliedUsd: 0,
    totalUsd: 10.5,
    totalKhr: 43100,
    paidUsd: 10.5,
    paidKhr: 0,
    changeUsd: 0,
    changeKhr: 0,
    cashierName: 'Cashier',
    createdAt: '2026-11-16T10:00:00Z',
    updatedAt: '2026-11-16T10:15:00Z',
  },
];

function buildReport(): AiStockMonitorReport {
  const payload = buildStockMonitorPayload({
    branch: { id: branch.id, name: branch.name },
    ingredients,
    recipes,
    menuItems: menu,
    orders,
    stockHistory: [],
    dailyRevenueHistory: [{ date: '2026-11-16', netSalesUsd: 120, bills: 18, guests: 30 }],
    referenceDate: '2026-11-17',
    alertThresholdDays: 5,
  });
  return normalizeAiStockMonitorReport(
    {},
    { model: 'rule-based-fallback', generatedAt: '2026-11-17T04:55:00Z', payload }
  );
}

describe('autoRestock utilities', () => {
  it('rounds restock quantities up to whole purchase packs', () => {
    // Tea: target = max(450, 30 * 7) = 450, deficit = max(500, 270) = 500 -> 1 bag
    assert.equal(
      computeRestockOrderPacks({
        onHand: 180,
        minLevel: 300,
        purchaseUnitSize: 500,
        dailyBurnRate: 30,
        bufferDays: 7,
      }),
      1
    );
    // Milk: target = max(750, 400 * 7) = 2800, deficit = 1200 -> 2 cartons
    assert.equal(
      computeRestockOrderPacks({
        onHand: 1600,
        minLevel: 500,
        purchaseUnitSize: 1000,
        dailyBurnRate: 400,
        bufferDays: 7,
      }),
      2
    );
    // Longer buffer -> 5 cartons (target 4000, deficit 2400 -> ceil 2.4 = 3)
    assert.equal(
      computeRestockOrderPacks({
        onHand: 1600,
        minLevel: 500,
        purchaseUnitSize: 1000,
        dailyBurnRate: 400,
        bufferDays: 10,
      }),
      3
    );
  });

  it('builds critical-only supplier drafts grouped by supplier with VAT and email', () => {
    const report = buildReport();
    const draft = buildAutoRestockDraft({
      branch,
      ingredients,
      suppliers,
      report,
      options: { nextPoSeq: 1, referenceDate: '2026-11-17' },
    });

    assert.equal(draft.items.length, 1);
    assert.equal(draft.items[0]?.ingredientId, 'ing_tea');
    assert.equal(draft.items[0]?.orderPacks, 1);
    assert.equal(draft.items[0]?.totalBaseUnits, 500);
    assert.equal(draft.items[0]?.unitCostUsd, 7);
    assert.equal(draft.items[0]?.lineTotalUsd, 7);

    assert.equal(draft.supplierDrafts.length, 1);
    const po = draft.supplierDrafts[0];
    assert.equal(po.supplierId, 'sup_coffee');
    assert.equal(po.poNumber, 'PO-2026-0001');
    assert.equal(po.subtotalUsd, 7);
    assert.equal(po.inputVatUsd, 0.7);
    assert.equal(po.totalUsd, 7.7);
    assert.equal(draft.totalEstimatedCostUsd, 7.7);
    assert.equal(draft.skippedWithoutSupplier.length, 0);

    assert.equal(po.email.to, 'orders@mekong.example');
    assert.ok(po.email.subject.includes('PO-2026-0001'));
    assert.ok(po.email.body.includes('Black tea leaves'));
    assert.ok(po.email.body.includes('1 × 500g bag'));
    assert.ok(po.email.body.includes('Total: $7.70'));
    assert.ok(po.email.body.includes('rule-based-fallback'));
    // Paragraph separators are preserved
    assert.ok(po.email.body.includes('\n\nITEMS\n'));
    assert.ok(po.email.body.startsWith('Dear Sokchea Meas team,\n\n'));
    assert.ok(po.email.body.includes('VATTIN: L001-900000001'));
    assert.equal(formatRestockPacks(draft.items[0]!), '1 × 500g bag');
  });

  it('includes warning items and splits them across suppliers', () => {
    const report = buildReport();
    const draft = buildAutoRestockDraft({
      branch,
      ingredients,
      suppliers,
      report,
      options: { includeWarnings: true, nextPoSeq: 1, referenceDate: '2026-11-17' },
    });

    assert.equal(draft.items.length, 2);
    assert.equal(draft.supplierDrafts.length, 2);

    const coffee = draft.supplierDrafts.find((d) => d.supplierId === 'sup_coffee');
    const dairy = draft.supplierDrafts.find((d) => d.supplierId === 'sup_dairy');
    assert.ok(coffee);
    assert.ok(dairy);
    assert.equal(coffee.lines.length, 1);
    assert.equal(dairy.lines.length, 1);
    assert.equal(dairy.lines[0]?.orderPacks, 2);
    assert.equal(dairy.lines[0]?.lineTotalUsd, 4);
    // Non-VAT supplier -> no input VAT
    assert.equal(dairy.inputVatUsd, 0);
    assert.equal(dairy.totalUsd, 4);
    assert.equal(dairy.poNumber, 'PO-2026-0002');
    assert.equal(dairy.email.to, 'sales@angkor.example');
    assert.ok(dairy.email.body.includes('Input VAT: not applicable'));

    assert.equal(draft.totalEstimatedCostUsd, 11.7);
  });

  it('supports removing lines and reassigning suppliers', () => {
    const report = buildReport();
    const draft = buildAutoRestockDraft({
      branch,
      ingredients,
      suppliers,
      report,
      options: {
        includeWarnings: true,
        nextPoSeq: 5,
        referenceDate: '2026-11-17',
        qtyOverrides: { ing_tea: 0 },
        supplierOverrides: { ing_milk: 'sup_coffee' },
      },
    });

    assert.equal(draft.items.length, 1);
    assert.equal(draft.items[0]?.ingredientId, 'ing_milk');
    assert.equal(draft.items[0]?.supplierId, 'sup_coffee');
    assert.equal(draft.supplierDrafts.length, 1);
    assert.equal(draft.supplierDrafts[0]?.poNumber, 'PO-2026-0005');
    assert.equal(draft.supplierDrafts[0]?.totalUsd, 4.4); // 4.00 + 10% VAT
  });

  it('skips ingredients when no supplier is available', () => {
    const report = buildReport();
    const draft = buildAutoRestockDraft({
      branch,
      ingredients,
      suppliers: [],
      report,
      options: { includeWarnings: true, referenceDate: '2026-11-17' },
    });

    assert.equal(draft.items.length, 0);
    assert.equal(draft.supplierDrafts.length, 0);
    assert.deepEqual(draft.skippedWithoutSupplier, ['Black tea leaves', 'Fresh milk']);
  });

  it('skips critical ingredients already covered by an open purchase order', () => {
    const report = buildReport();
    const openPo = {
      id: 'po_open',
      branchId: 'b1',
      status: 'sent',
      lines: [{ ingredientId: 'ing_tea', receivedQty: 0, orderedQty: 2 }],
    } as unknown as PurchaseOrder;

    const draft = buildAutoRestockDraft({
      branch,
      ingredients,
      suppliers,
      report,
      existingPurchaseOrders: [openPo],
      options: { referenceDate: '2026-11-17' },
    });

    assert.equal(draft.items.length, 0);
    assert.equal(draft.supplierDrafts.length, 0);
    assert.deepEqual(draft.skippedOnOpenPo, ['Black tea leaves']);
  });

  it('builds an encoded mailto URL', () => {
    const report = buildReport();
    const draft = buildAutoRestockDraft({
      branch,
      ingredients,
      suppliers,
      report,
      options: { referenceDate: '2026-11-17' },
    });
    const url = buildMailtoUrl(draft.supplierDrafts[0]!.email);
    assert.ok(url.startsWith('mailto:orders@mekong.example?subject='));
    const query = url.split('?')[1]!;
    const params = new URLSearchParams(query);
    assert.equal(params.get('subject'), draft.supplierDrafts[0]!.email.subject);
    assert.equal(params.get('body'), draft.supplierDrafts[0]!.email.body);
  });
});
