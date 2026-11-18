import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInventoryProjection,
  computeHistoricalSalesVelocity,
} from './inventoryProjection';
import type {
  DailyRevenuePoint,
  Ingredient,
  MenuItem,
  PosOrder,
  PurchaseOrder,
  Recipe,
  StockHistoryEntry,
  Supplier,
} from '../types/pos';

function buildHistory(values: number[]): DailyRevenuePoint[] {
  return values.map((v, idx) => ({
    date: `${String(idx + 1).padStart(2, '0')}/11`,
    netSalesUsd: v,
    bills: 20,
    guests: 35,
  }));
}

const sampleSuppliers: Supplier[] = [
  {
    id: 'sup_1',
    branchId: 'all',
    name: 'Mekong Coffee Co.',
    nameKh: 'មេគង្គ កាហ្វេ',
    category: 'Coffee & Tea',
    contactName: 'Dara',
    phone: '012 333 444',
    paymentTerms: 'net_15',
    defaultWhtPercent: 0,
    active: true,
    createdAt: '2026-10-01T00:00:00Z',
  },
];

const sampleMenu: MenuItem[] = [
  {
    id: 'm_latte',
    branchId: 'b1',
    nameEn: 'Iced Latte',
    nameKh: 'ឡាតេ',
    nameVi: 'Latte đá',
    category: 'Coffee & tea',
    priceUsd: 2.5,
    station: 'bar',
    initials: 'IL',
    active: true,
  },
];

const sampleRecipes: Recipe[] = [
  {
    menuItemId: 'm_latte',
    lines: [{ ingredientId: 'ing_beans', qtyPerPortion: 20 }],
  },
];

test('computeHistoricalSalesVelocity computes accelerating, softening, and clamped ratios', () => {
  const empty = computeHistoricalSalesVelocity([]);
  assert.equal(empty.historicalTrendFactor, 1);
  assert.equal(empty.daysAnalyzed, 0);

  // 14 days flat at $200/day -> 1.0x
  const flat = computeHistoricalSalesVelocity(buildHistory(Array(14).fill(200)));
  assert.equal(flat.historicalTrendFactor, 1);
  assert.equal(flat.recent7dAvgSalesUsd, 200);

  // Strong recent growth clamped at 1.45x
  const surging = computeHistoricalSalesVelocity(
    buildHistory([100, 100, 100, 100, 100, 100, 100, 500, 500, 500, 500, 500, 500, 500])
  );
  assert.equal(surging.historicalTrendFactor, 1.45);

  // Drop clamped at 0.75x
  const dipping = computeHistoricalSalesVelocity(
    buildHistory([500, 500, 500, 500, 500, 500, 500, 100, 100, 100, 100, 100, 100, 100])
  );
  assert.equal(dipping.historicalTrendFactor, 0.75);
});

test('buildInventoryProjection calculates depletion date and order-by date for low-stock items', () => {
  const ingredients: Ingredient[] = [
    {
      id: 'ing_beans',
      branchId: 'b1',
      nameEn: 'Coffee beans',
      nameKh: 'គ្រាប់កាហ្វេ',
      unit: 'g',
      purchaseUnit: '1kg bag',
      purchaseUnitSize: 1000,
      onHand: 1000, // 100g/day burn -> 10 days to deplete
      minLevel: 400,
      used7d: 700, // 100g/day
      avgCostUsd: 0.012,
    },
    {
      id: 'ing_tea',
      branchId: 'b1',
      nameEn: 'Black tea leaves',
      nameKh: 'ស្លឹកតែ',
      unit: 'g',
      purchaseUnit: '500g bag',
      purchaseUnitSize: 500,
      onHand: 200, // Already below minLevel 300!
      minLevel: 300,
      used7d: 140, // 20g/day -> 10 days, but below minLevel so overdue
      avgCostUsd: 0.014,
    },
    {
      id: 'ing_syrup',
      branchId: 'b1',
      nameEn: 'Vanilla syrup',
      nameKh: 'ស៊ីរ៉ូ',
      unit: 'ml',
      purchaseUnit: '1L bottle',
      purchaseUnitSize: 1000,
      onHand: 8000, // 50ml/day -> 160 days (>60d)
      minLevel: 1000,
      used7d: 350,
      avgCostUsd: 0.005,
    },
  ];

  const projection = buildInventoryProjection({
    branch: { id: 'b1', name: 'Main Branch' },
    ingredients,
    recipes: sampleRecipes,
    menuItems: sampleMenu,
    orders: [],
    stockHistory: [],
    dailyRevenueHistory: buildHistory(Array(14).fill(200)),
    suppliers: sampleSuppliers,
    options: {
      referenceDate: '2026-11-18',
      forecastHorizonDays: 14,
      leadTimeDays: 2,
      safetyBufferDays: 2,
      scenarioMode: 'historical',
    },
  });

  assert.equal(projection.historicalTrendFactor, 1);
  assert.equal(projection.effectiveMultiplier, 1);
  assert.equal(projection.items.length, 3);

  const tea = projection.items.find((i) => i.ingredientId === 'ing_tea')!;
  assert.equal(tea.orderByStatus, 'overdue');
  assert.equal(tea.orderByDate, '2026-11-18');
  assert.equal(tea.daysUntilOrderBy, 0);
  assert.equal(tea.isLowStock, true);
  assert.equal(tea.supplierName, 'Mekong Coffee Co.');

  const beans = projection.items.find((i) => i.ingredientId === 'ing_beans')!;
  assert.equal(beans.projectedDailyBurn, 100);
  assert.equal(beans.daysUntilDepletion, 10);
  assert.equal(beans.predictedDepletionDate, '2026-11-28');
  // 10 days to deplete minus (2 lead + 2 buffer) = 6 days until order by -> 2026-11-24
  assert.equal(beans.daysUntilOrderBy, 6);
  assert.equal(beans.orderByDate, '2026-11-24');
  assert.equal(beans.orderByStatus, 'planned');
  assert.equal(beans.isLowStock, true);
  assert.equal(beans.dailySeries.length, 15);
  assert.equal(beans.dailySeries[0].projectedOnHand, 1000);
  assert.equal(beans.dailySeries[10].projectedOnHand, 0);

  const syrup = projection.items.find((i) => i.ingredientId === 'ing_syrup')!;
  assert.equal(syrup.predictedDepletionDate, 'Stable (>60d)');
  assert.equal(syrup.orderByStatus, 'healthy');
  assert.equal(syrup.isLowStock, false);
});

test('buildInventoryProjection scales burn under busy scenario and tracks incoming open POs', () => {
  const ingredients: Ingredient[] = [
    {
      id: 'ing_beans',
      branchId: 'b1',
      nameEn: 'Coffee beans',
      nameKh: 'គ្រាប់កាហ្វេ',
      unit: 'g',
      purchaseUnit: '1kg bag',
      purchaseUnitSize: 1000,
      onHand: 1200,
      minLevel: 400,
      used7d: 700, // 100g/day
      avgCostUsd: 0.012,
    },
  ];

  const orders: PosOrder[] = [
    {
      id: 'ord_1',
      branchId: 'b1',
      orderNumber: 101,
      tableName: 'T1',
      channel: 'dine_in',
      status: 'paid',
      guests: 2,
      currentRound: 1,
      manualDiscountPercent: 0,
      manualDiscountUsd: 0,
      promoDiscountUsd: 0,
      pointsRedeemed: 0,
      depositAppliedUsd: 0,
      totalUsd: 10,
      totalKhr: 41000,
      paidUsd: 10,
      paidKhr: 0,
      changeUsd: 0,
      changeKhr: 0,
      cashierName: 'Cashier',
      createdAt: '2026-11-18T08:00:00Z',
      updatedAt: '2026-11-18T08:00:00Z',
      items: [
        {
          id: 'l1',
          menuItemId: 'm_latte',
          nameEn: 'Iced Latte',
          nameKh: 'ឡាតេ',
          nameVi: 'Latte',
          unitPriceUsd: 2.5,
          qty: 5,
          station: 'bar',
          category: 'Coffee',
          round: 1,
          sentToKitchen: true,
        },
      ],
    },
  ];

  const purchaseOrders: PurchaseOrder[] = [
    {
      id: 'po_open',
      poNumber: 'PO-2026-0005',
      branchId: 'b1',
      supplierId: 'sup_1',
      supplierName: 'Mekong Coffee Co.',
      status: 'sent',
      paymentStatus: 'unpaid',
      orderDate: '2026-11-17',
      expectedDate: '2026-11-20',
      dueDate: '2026-12-02',
      paymentTerms: 'net_15',
      applyInputVat: false,
      whtPercent: 0,
      lines: [
        {
          id: 'pl1',
          ingredientId: 'ing_beans',
          itemName: 'Coffee beans',
          unit: 'g',
          orderedQty: 2000,
          receivedQty: 500,
          unitCostUsd: 0.012,
          lineTotalUsd: 24,
        },
      ],
      subtotalUsd: 24,
      inputVatUsd: 0,
      totalUsd: 24,
      totalKhr: 98400,
      receivedSubtotalUsd: 0,
      receivedVatUsd: 0,
      receivedTotalUsd: 0,
      paidUsd: 0,
      whtWithheldUsd: 0,
      balanceDueUsd: 24,
      grnHistory: [],
      payments: [],
      createdBy: 'Owner',
      createdAt: '2026-11-17T10:00:00Z',
      updatedAt: '2026-11-17T10:00:00Z',
    },
  ];

  const stockHistory: StockHistoryEntry[] = [
    {
      id: 'sh_w1',
      ingredientId: 'ing_beans',
      ingredientName: 'Coffee beans',
      type: 'waste',
      qtyDelta: -140,
      note: 'Spilled',
      createdAt: '2026-11-17T09:00:00Z',
    },
  ];

  const projection = buildInventoryProjection({
    branch: { id: 'b1', name: 'Main Branch' },
    ingredients,
    recipes: sampleRecipes,
    menuItems: sampleMenu,
    orders,
    stockHistory,
    dailyRevenueHistory: buildHistory(Array(14).fill(200)),
    suppliers: sampleSuppliers,
    purchaseOrders,
    options: {
      referenceDate: '2026-11-18',
      forecastHorizonDays: 14,
      leadTimeDays: 2,
      safetyBufferDays: 2,
      scenarioMode: 'busy',
    },
  });

  const beans = projection.items[0];
  assert.equal(projection.effectiveMultiplier, 1.2);
  // observedUsed7d = max(700, 100) + 140*0.5 = 770 -> baseDailyBurn = 110 -> busy = 132/day
  assert.equal(beans.observedUsed7d, 770);
  assert.equal(beans.baseDailyBurn, 110);
  assert.equal(beans.projectedDailyBurn, 132);
  assert.equal(beans.openPoIncomingQty, 1500);
  assert.equal(beans.openPoExpectedDate, '2026-11-20');
  assert.deepEqual(beans.linkedDishes, ['Iced Latte']);
});
