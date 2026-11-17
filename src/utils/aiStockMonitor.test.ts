import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Ingredient, MenuItem, PosOrder, Recipe } from '../types/pos';
import {
  addDaysIso,
  buildStaffAlertsFromReport,
  buildStockMonitorFingerprint,
  buildStockMonitorPayload,
  classifyStockUrgency,
  normalizeAiStockMonitorReport,
} from './aiStockMonitor';

const sampleIngredients: Ingredient[] = [
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
    used7d: 210, // 30g/day -> 6 days left, and below minLevel -> critical!
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
    used7d: 2800, // 400ml/day -> 4 days left -> warning (within 5d threshold)
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
    used7d: 700, // 100g/day -> 50 days left -> healthy
    avgCostUsd: 0.012,
  },
];

const sampleMenu: MenuItem[] = [
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

const sampleRecipes: Recipe[] = [
  {
    menuItemId: 'm_latte',
    lines: [
      { ingredientId: 'ing_beans', qtyPerPortion: 20 },
      { ingredientId: 'ing_milk', qtyPerPortion: 200 },
    ],
  },
];

const sampleOrders: PosOrder[] = [
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

describe('aiStockMonitor utilities', () => {
  it('builds sales-linked ingredient consumption signals and fingerprint', () => {
    const payload = buildStockMonitorPayload({
      branch: { id: 'b1', name: 'Lotus Café' },
      ingredients: sampleIngredients,
      recipes: sampleRecipes,
      menuItems: sampleMenu,
      orders: sampleOrders,
      stockHistory: [],
      dailyRevenueHistory: [{ date: '11-16', netSalesUsd: 120, bills: 18, guests: 30 }],
      referenceDate: '2026-11-17',
      alertThresholdDays: 5,
    });

    assert.equal(payload.ingredients.length, 3);
    const milk = payload.ingredients.find((i) => i.ingredientId === 'ing_milk');
    assert.ok(milk);
    assert.equal(milk.recentOrderUsage, 600); // 3 lattes * 200ml
    assert.equal(milk.baselineDailyBurn, 400); // 2800 / 7
    assert.equal(milk.baselineDaysRemaining, 4); // 1600 / 400
    assert.deepEqual(milk.linkedDishNames, ['Iced Latte']);

    const fp = buildStockMonitorFingerprint('tenant_1', payload);
    assert.ok(fp.includes('ing_milk:1600.0'));
  });

  it('classifies stock urgency levels accurately', () => {
    assert.equal(
      classifyStockUrgency({ onHand: 0, minLevel: 100, estimatedDaysRemaining: 0, alertThresholdDays: 5 }),
      'out'
    );
    assert.equal(
      classifyStockUrgency({ onHand: 180, minLevel: 300, estimatedDaysRemaining: 6, alertThresholdDays: 5 }),
      'critical'
    );
    assert.equal(
      classifyStockUrgency({ onHand: 800, minLevel: 200, estimatedDaysRemaining: 2.5, alertThresholdDays: 5 }),
      'critical'
    );
    assert.equal(
      classifyStockUrgency({ onHand: 1600, minLevel: 500, estimatedDaysRemaining: 4.5, alertThresholdDays: 5 }),
      'warning'
    );
    assert.equal(
      classifyStockUrgency({ onHand: 5000, minLevel: 1000, estimatedDaysRemaining: 20, alertThresholdDays: 5 }),
      'healthy'
    );
  });

  it('normalizes Gemini stock monitor predictions, anchors burn rates, and generates staff alerts', () => {
    const payload = buildStockMonitorPayload({
      branch: { id: 'b1', name: 'Lotus Café' },
      ingredients: sampleIngredients,
      recipes: sampleRecipes,
      menuItems: sampleMenu,
      orders: sampleOrders,
      stockHistory: [],
      dailyRevenueHistory: [{ date: '11-16', netSalesUsd: 120, bills: 18, guests: 30 }],
      referenceDate: '2026-11-17',
      alertThresholdDays: 5,
    });

    const report = normalizeAiStockMonitorReport(
      {
        summary: 'Black tea leaves and Fresh milk need immediate restocking.',
        recommendedActions: ['Order Fresh milk cartons before Friday'],
        predictions: [
          {
            ingredientId: 'ing_milk',
            dailyBurnRate: 420,
            estimatedDaysRemaining: 3.8,
            suggestedReorderQty: 2000,
            rationale: 'Iced Latte sales are accelerating milk usage.',
            staffAlertMessage: 'Fresh milk will run out in ~3.8 days. Order 2x 1L cartons.',
          },
          {
            ingredientId: 'ing_beans',
            dailyBurnRate: 9999, // Wild AI outlier should be clamped to 2.5x baseline (250)
            estimatedDaysRemaining: 0.5,
          },
        ],
      },
      {
        model: 'gemini-4-hydrogen',
        generatedAt: '2026-11-17T04:55:00Z',
        payload,
      }
    );

    assert.equal(report.model, 'gemini-4-hydrogen');
    assert.equal(report.criticalCount, 1); // Black tea leaves below minLevel
    assert.equal(report.warningCount, 1); // Fresh milk ~3.8d
    assert.equal(report.alertCount, 2);
    assert.equal(report.items[0]?.ingredientId, 'ing_tea'); // Critical sorted first

    const milkItem = report.items.find((i) => i.ingredientId === 'ing_milk');
    assert.ok(milkItem);
    assert.equal(milkItem.urgency, 'warning');
    assert.equal(milkItem.predictedRunOutDate, addDaysIso('2026-11-17', 3)); // floor(3.8) = 3 -> Nov 20
    assert.equal(milkItem.estimatedReorderCostUsd, 4); // 2000 * 0.002

    const beansItem = report.items.find((i) => i.ingredientId === 'ing_beans');
    assert.ok(beansItem);
    // Clamped burn rate = 100 * 2.5 = 250 -> 5000 / 250 = 20 days -> healthy!
    assert.equal(beansItem.dailyBurnRate, 250);
    assert.equal(beansItem.estimatedDaysRemaining, 20);
    assert.equal(beansItem.urgency, 'healthy');

    const alerts = buildStaffAlertsFromReport('b1', report);
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0]?.ingredientId, 'ing_tea');
    assert.equal(alerts[1]?.ingredientId, 'ing_milk');
    assert.ok(alerts[1]?.message.includes('Fresh milk'));
  });
});
