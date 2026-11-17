import test from 'node:test';
import assert from 'node:assert/strict';
import type { MenuItem, PosOrder } from '../types/pos';
import {
  buildAiPairingsFingerprint,
  buildAiPairingsPayload,
  normalizeAiPairingsReport,
} from './aiPairings';

const branch = {
  id: 'b1',
  name: 'Lotus Café BKK1',
  exchangeRate: 4100,
  rielRounding: 100 as const,
};

const menuItems: MenuItem[] = [
  {
    id: 'm_loklak',
    branchId: 'b1',
    nameEn: 'Beef lok lak',
    nameKh: 'ឡុកឡាក់សាច់គោ',
    nameVi: 'Bò lúc lắc',
    category: 'Main dishes',
    priceUsd: 6.5,
    station: 'kitchen',
    initials: 'BL',
    active: true,
    isBestSeller: true,
    oftenOrderedWith: ['m_spring_rolls'],
  },
  {
    id: 'm_fried_rice',
    branchId: 'b1',
    nameEn: 'Fried rice with seafood',
    nameKh: 'បាយឆាគ្រឿងសមុទ្រ',
    nameVi: 'Cơm chiên hải sản',
    category: 'Main dishes',
    priceUsd: 5.0,
    station: 'kitchen',
    initials: 'FR',
    active: true,
  },
  {
    id: 'm_iced_coffee',
    branchId: 'b1',
    nameEn: 'Iced coffee with condensed milk',
    nameKh: 'កាហ្វេទឹកដោះគោទឹកកក',
    nameVi: 'Cà phê sữa đá',
    category: 'Coffee & tea',
    priceUsd: 2.5,
    station: 'bar',
    initials: 'IC',
    active: true,
    isBestSeller: true,
  },
  {
    id: 'm_spring_rolls',
    branchId: 'b1',
    nameEn: 'Fried spring rolls',
    nameKh: 'ណែមចៀន',
    nameVi: 'Chả giò giòn',
    category: 'Starters',
    priceUsd: 3.25,
    station: 'kitchen',
    initials: 'SR',
    active: true,
  },
  {
    id: 'm_inactive',
    branchId: 'b1',
    nameEn: 'Seasonal Soup',
    nameKh: 'ស៊ុប',
    nameVi: 'Súp',
    category: 'Starters',
    priceUsd: 3.0,
    station: 'kitchen',
    initials: 'SS',
    active: false,
  },
];

function makeOrder(
  id: string,
  orderNumber: number,
  itemIds: string[],
  status: PosOrder['status'] = 'paid'
): PosOrder {
  return {
    id,
    branchId: 'b1',
    orderNumber,
    tableName: 'T01',
    channel: 'dine_in',
    status,
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
    cashierName: 'Staff',
    createdAt: '2026-11-17T08:00:00.000Z',
    updatedAt: '2026-11-17T08:30:00.000Z',
    items: itemIds.map((menuItemId, idx) => ({
      id: `${id}_line_${idx}`,
      menuItemId,
      nameEn: menuItemId,
      nameKh: '',
      nameVi: '',
      unitPriceUsd: 5,
      qty: 1,
      station: 'kitchen',
      category: 'Main dishes',
      round: 1,
      sentToKitchen: true,
      kdsStatus: 'served',
    })),
  };
}

test('buildAiPairingsPayload aggregates historical co-occurrence and excludes cart & voided orders', () => {
  const activeOrder = makeOrder('ord_active', 201, ['m_loklak'], 'open');
  const orders: PosOrder[] = [
    activeOrder,
    makeOrder('ord_h1', 101, ['m_loklak', 'm_iced_coffee', 'm_fried_rice'], 'paid'),
    makeOrder('ord_h2', 102, ['m_loklak', 'm_iced_coffee'], 'paid'),
    makeOrder('ord_h3', 103, ['m_loklak', 'm_spring_rolls'], 'voided'), // voided -> ignored
    makeOrder('ord_h4', 104, ['m_fried_rice'], 'paid'),
  ];

  const payload = buildAiPairingsPayload({
    branch,
    menuItems,
    orders,
    activeOrder,
  });

  assert.equal(payload.historicalOrdersAnalyzed, 3);
  assert.equal(payload.cartItems.length, 1);
  assert.equal(payload.cartItems[0].menuItemId, 'm_loklak');

  // Inactive and cart items must be excluded from candidates
  assert.equal(payload.candidates.some((c) => c.menuItemId === 'm_loklak'), false);
  assert.equal(payload.candidates.some((c) => c.menuItemId === 'm_inactive'), false);

  const coffee = payload.candidates.find((c) => c.menuItemId === 'm_iced_coffee');
  assert.ok(coffee);
  assert.equal(coffee.coOrderCount, 2);
  assert.equal(coffee.coOrderConfidencePct, 99);
  assert.equal(coffee.priceKhr, 10300);

  const rolls = payload.candidates.find((c) => c.menuItemId === 'm_spring_rolls');
  assert.ok(rolls);
  assert.equal(rolls.isCatalogPairing, true);
  assert.equal(rolls.coOrderCount, 0); // voided order was ignored
});

test('normalizeAiPairingsReport filters unknown or in-cart items, deduplicates, and caps at 3', () => {
  const activeOrder = makeOrder('ord_active', 201, ['m_loklak'], 'open');
  const payload = buildAiPairingsPayload({
    branch,
    menuItems,
    orders: [makeOrder('ord_h1', 101, ['m_loklak', 'm_iced_coffee'])],
    activeOrder,
  });

  const report = normalizeAiPairingsReport(
    {
      summary: 'Strong drink & starter pairings for Beef lok lak.',
      pairings: [
        { menuItemId: 'm_loklak', tag: 'Duplicate in cart', reason: 'Should be skipped' },
        { menuItemId: 'm_ghost_id', tag: 'Hallucinated', reason: 'Should be skipped' },
        {
          menuItemId: 'm_iced_coffee',
          tag: 'Drink pairing',
          reason: 'Ordered with Beef lok lak in past tickets.',
          confidencePct: 92,
        },
        {
          menuItemId: 'm_iced_coffee', // duplicate
          tag: 'Dup',
          reason: 'Should be skipped',
        },
        {
          menuItemId: 'm_spring_rolls',
          tag: 'Starter add-on',
          reason: 'Crisp starter before lok lak.',
          confidencePct: 140, // clamped to 99
        },
        {
          menuItemId: 'm_fried_rice',
          tag: 'Shareable main',
          reason: 'Popular group side.',
          confidencePct: 10, // clamped to 45
        },
      ],
    },
    {
      model: 'gemini-4-hydrogen',
      generatedAt: '2026-11-17T05:00:00.000Z',
      payload,
    }
  );

  assert.equal(report.pairings.length, 3);
  assert.equal(report.pairings[0].menuItemId, 'm_iced_coffee');
  assert.equal(report.pairings[0].confidencePct, 92);
  assert.equal(report.pairings[1].confidencePct, 99);
  assert.equal(report.pairings[2].confidencePct, 45);
});

test('buildAiPairingsFingerprint is order-invariant across cart lines and reacts to new orders', () => {
  const a = buildAiPairingsFingerprint('tenant_1', {
    branchId: 'b1',
    historicalOrdersAnalyzed: 5,
    cartItems: [
      { menuItemId: 'm_b', nameEn: 'B', category: 'Main', station: 'kitchen', qty: 1, unitPriceUsd: 5 },
      { menuItemId: 'm_a', nameEn: 'A', category: 'Bar', station: 'bar', qty: 1, unitPriceUsd: 2 },
    ],
  });
  const b = buildAiPairingsFingerprint('tenant_1', {
    branchId: 'b1',
    historicalOrdersAnalyzed: 5,
    cartItems: [
      { menuItemId: 'm_a', nameEn: 'A', category: 'Bar', station: 'bar', qty: 2, unitPriceUsd: 2 },
      { menuItemId: 'm_b', nameEn: 'B', category: 'Main', station: 'kitchen', qty: 1, unitPriceUsd: 5 },
    ],
  });
  const c = buildAiPairingsFingerprint('tenant_1', {
    branchId: 'b1',
    historicalOrdersAnalyzed: 6,
    cartItems: [
      { menuItemId: 'm_a', nameEn: 'A', category: 'Bar', station: 'bar', qty: 1, unitPriceUsd: 2 },
      { menuItemId: 'm_b', nameEn: 'B', category: 'Main', station: 'kitchen', qty: 1, unitPriceUsd: 5 },
    ],
  });

  assert.equal(a, b);
  assert.notEqual(a, c);
});
