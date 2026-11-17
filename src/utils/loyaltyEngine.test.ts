import test from 'node:test';
import assert from 'node:assert/strict';
import type { LoyaltyReward, MemberCustomer, MenuItem, PosOrder } from '../types/pos';
import { calculateOrderTotals, type OrderLineItem } from './posMath';
import {
  applyLoyaltyRewardToOrderItems,
  calculatePointsDiscountUsd,
  calculatePointsEarned,
  computeMemberTier,
  findMemberByPhone,
  getMaxRedeemableDiscountPoints,
  normalizeCustomerPhone,
  removeLoyaltyRewardLine,
  settleMemberLoyalty,
} from './loyaltyEngine';

const sampleCoffee: MenuItem = {
  id: 'm_coffee',
  branchId: 'branch_bkk1',
  nameEn: 'Iced coffee',
  nameKh: 'កាហ្វេទឹកកក',
  nameVi: 'Cà phê đá',
  category: 'Coffee & tea',
  priceUsd: 2.5,
  station: 'bar',
  initials: 'IC',
  active: true,
};

const coffeeReward: LoyaltyReward = {
  id: 'loy_coffee',
  branchId: 'branch_bkk1',
  name: 'Free Iced coffee',
  menuItemId: 'm_coffee',
  menuItemName: 'Iced coffee',
  pointsCost: 150,
  active: true,
};

const sampleMember: MemberCustomer = {
  id: 'mem_1',
  name: 'Sokha Chan',
  phone: '012 345 678',
  points: 300,
  totalSpentUsd: 95,
  tier: 'Member',
  lastVisit: '2026-11-15',
};

test('phone normalization matches spaced and unspaced customer phone numbers', () => {
  assert.equal(normalizeCustomerPhone('012 345-678'), '012345678');
  const found = findMemberByPhone([sampleMember], '012345678');
  assert.equal(found?.id, 'mem_1');
});

test('calculatePointsEarned respects pointsEnabled, earn rate, and tier multipliers', () => {
  assert.equal(
    calculatePointsEarned({ totalUsd: 17.85, pointsPerDollar: 1, pointsEnabled: true }),
    17
  );
  assert.equal(
    calculatePointsEarned({ totalUsd: 17.85, pointsPerDollar: 2, pointsEnabled: true }),
    35
  );
  assert.equal(
    calculatePointsEarned({ totalUsd: 17.85, pointsPerDollar: 1, pointsEnabled: false }),
    0
  );
  // Silver 1.25x -> floor(22.3125) = 22
  assert.equal(
    calculatePointsEarned({
      totalUsd: 17.85,
      pointsPerDollar: 1,
      pointsEnabled: true,
      tier: 'Silver',
    }),
    22
  );
  // Gold 1.5x -> floor(26.775) = 26
  assert.equal(
    calculatePointsEarned({
      totalUsd: 17.85,
      pointsPerDollar: 1,
      pointsEnabled: true,
      tier: 'Gold',
    }),
    26
  );
  // Explicit multiplier override wins over the tier default
  assert.equal(
    calculatePointsEarned({
      totalUsd: 10,
      pointsPerDollar: 1,
      pointsEnabled: true,
      tier: 'Gold',
      tierMultiplier: 3,
    }),
    30
  );
});

test('applyLoyaltyRewardToOrderItems splits multi-qty cart line into paid + free and zero-prices free item', () => {
  const existingLines: OrderLineItem[] = [
    {
      id: 'oi_1',
      menuItemId: 'm_coffee',
      nameEn: 'Iced coffee',
      nameKh: 'កាហ្វេ',
      nameVi: 'Cà phê',
      unitPriceUsd: 2.5,
      qty: 2,
      station: 'bar',
      category: 'Coffee & tea',
      round: 1,
      sentToKitchen: true,
      kdsStatus: 'new',
    },
  ];

  const afterApply = applyLoyaltyRewardToOrderItems({
    items: existingLines,
    reward: coffeeReward,
    menuItem: sampleCoffee,
    currentRound: 1,
  });

  assert.equal(afterApply.length, 2);
  assert.equal(afterApply[0].qty, 1);
  assert.equal(Boolean(afterApply[0].redeemedByLoyalty), false);
  assert.equal(afterApply[1].qty, 1);
  assert.equal(afterApply[1].redeemedByLoyalty, true);
  assert.equal(afterApply[1].loyaltyPointsCost, 150);

  const totals = calculateOrderTotals({
    items: afterApply,
    exchangeRate: 4100,
    rielRounding: 100,
    vatPercent: 10,
    serviceChargePercent: 0,
  });
  assert.equal(totals.subtotalUsd, 2.5);
  assert.equal(totals.totalUsd, 2.75);

  const afterRemove = removeLoyaltyRewardLine(afterApply, afterApply[1].id);
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].qty, 2);
  assert.equal(Boolean(afterRemove[0].redeemedByLoyalty), false);
});

test('applyLoyaltyRewardToOrderItems appends complimentary item when not already in bill', () => {
  const afterApply = applyLoyaltyRewardToOrderItems({
    items: [],
    reward: coffeeReward,
    menuItem: sampleCoffee,
    currentRound: 1,
  });
  assert.equal(afterApply.length, 1);
  assert.equal(afterApply[0].redeemedByLoyalty, true);
  assert.equal(afterApply[0].menuItemId, 'm_coffee');

  const afterRemove = removeLoyaltyRewardLine(afterApply, afterApply[0].id);
  assert.equal(afterRemove.length, 0);
});

test('settleMemberLoyalty deducts discount + free item points, accrues new points, upgrades tier, and writes ledger', () => {
  const order: PosOrder = {
    id: 'ord_test_1',
    branchId: 'branch_bkk1',
    orderNumber: 205,
    tableName: 'T02',
    channel: 'dine_in',
    status: 'paid',
    guests: 2,
    items: [
      {
        id: 'oi_main',
        menuItemId: 'm_loklak',
        nameEn: 'Beef lok lak',
        nameKh: 'ឡុកឡាក់',
        nameVi: 'Bò lúc lắc',
        unitPriceUsd: 10,
        qty: 1,
        station: 'kitchen',
        category: 'Main dishes',
        round: 1,
        sentToKitchen: true,
        kdsStatus: 'served',
      },
      {
        id: 'oi_loy_add_1',
        menuItemId: 'm_coffee',
        nameEn: 'Iced coffee',
        nameKh: 'កាហ្វេ',
        nameVi: 'Cà phê',
        unitPriceUsd: 2.5,
        qty: 1,
        station: 'bar',
        category: 'Coffee & tea',
        round: 1,
        sentToKitchen: true,
        kdsStatus: 'new',
        redeemedByLoyalty: true,
        loyaltyRewardId: coffeeReward.id,
        loyaltyRewardName: coffeeReward.name,
        loyaltyPointsCost: 150,
      },
    ],
    currentRound: 1,
    manualDiscountPercent: 0,
    manualDiscountUsd: 0,
    promoDiscountUsd: 0,
    pointsRedeemed: 100,
    memberId: 'mem_1',
    memberPhone: '012345678',
    depositAppliedUsd: 0,
    totalUsd: 9.9,
    totalKhr: 40600,
    paidUsd: 10,
    paidKhr: 0,
    changeUsd: 0,
    changeKhr: 400,
    cashierName: 'Sokha',
    createdAt: '2026-11-17T10:00:00.000Z',
    updatedAt: '2026-11-17T10:00:00.000Z',
  };

  const settled = settleMemberLoyalty({
    member: sampleMember,
    order,
    totalPaidUsd: 9.9,
    branch: { pointsEnabled: true, pointsPerDollar: 1, pointsValuePer100: 1 },
    offlineMode: false,
    nowIso: '2026-11-17T10:05:00.000Z',
  });

  // 300 start - 150 item - 100 discount + floor(9.9) earn + 100 tier-up bonus = 159 pts
  assert.equal(settled.itemPointsUsed, 150);
  assert.equal(settled.discountPointsUsed, 100);
  assert.equal(settled.earnedPoints, 9);
  assert.equal(settled.bonusPoints, 100);
  assert.equal(settled.tierUpgradedTo, 'Silver');
  assert.equal(settled.balanceAfter, 159);
  assert.equal(settled.updatedMember.points, 159);
  // 95 + 9.9 = 104.9 -> upgrades from Member to Silver
  assert.equal(computeMemberTier(settled.updatedMember.totalSpentUsd), 'Silver');
  assert.equal(settled.updatedMember.tier, 'Silver');
  assert.equal(settled.updatedMember.loyaltyHistory?.length, 4);
  assert.equal(calculatePointsDiscountUsd(100, 1), 1);
  assert.equal(
    getMaxRedeemableDiscountPoints({
      memberPoints: 300,
      alreadyUsedForItems: 150,
      remainingSubtotalUsd: 10,
      pointsValuePer100: 1,
    }),
    150
  );
});

test('settleMemberLoyalty credits tier-multiplied earnings and a tier-up bonus', () => {
  const goldMember: MemberCustomer = {
    ...sampleMember,
    points: 500,
    totalSpentUsd: 520,
    tier: 'Gold',
  };
  const order: PosOrder = {
    id: 'ord_test_gold',
    branchId: 'branch_bkk1',
    orderNumber: 206,
    tableName: 'T03',
    channel: 'dine_in',
    status: 'paid',
    guests: 1,
    items: [
      {
        id: 'oi_1',
        menuItemId: 'm_coffee',
        nameEn: 'Iced coffee',
        nameKh: 'កាហ្វេ',
        nameVi: 'Cà phê',
        unitPriceUsd: 2.5,
        qty: 2,
        station: 'bar',
        category: 'Coffee & tea',
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
    memberId: goldMember.id,
    memberPhone: goldMember.phone,
    depositAppliedUsd: 0,
    totalUsd: 5,
    totalKhr: 20500,
    paidUsd: 5,
    paidKhr: 0,
    changeUsd: 0,
    changeKhr: 0,
    cashierName: 'Sokha',
    createdAt: '2026-11-17T11:00:00.000Z',
    updatedAt: '2026-11-17T11:00:00.000Z',
  };

  const settled = settleMemberLoyalty({
    member: goldMember,
    order,
    totalPaidUsd: 5,
    branch: { pointsEnabled: true, pointsPerDollar: 1, pointsValuePer100: 1 },
    offlineMode: false,
    nowIso: '2026-11-17T11:05:00.000Z',
  });

  // Gold 1.5x -> floor(5 * 1.5) = 7; no tier-up (already Gold)
  assert.equal(settled.earnedPoints, 7);
  assert.equal(settled.bonusPoints, 0);
  assert.equal(settled.tierUpgradedTo, null);
  assert.equal(settled.balanceAfter, 507);
  assert.equal(settled.updatedMember.tier, 'Gold');
});

test('settleMemberLoyalty credits earnings offline but keeps redemptions online-only', () => {
  const order: PosOrder = {
    id: 'ord_test_offline',
    branchId: 'branch_bkk1',
    orderNumber: 207,
    tableName: 'T04',
    channel: 'dine_in',
    status: 'paid',
    guests: 1,
    items: [
      {
        id: 'oi_1',
        menuItemId: 'm_coffee',
        nameEn: 'Iced coffee',
        nameKh: 'កាហ្វេ',
        nameVi: 'Cà phê',
        unitPriceUsd: 2.5,
        qty: 2,
        station: 'bar',
        category: 'Coffee & tea',
        round: 1,
        sentToKitchen: true,
        kdsStatus: 'served',
      },
    ],
    currentRound: 1,
    manualDiscountPercent: 0,
    manualDiscountUsd: 0,
    promoDiscountUsd: 0,
    pointsRedeemed: 100,
    memberId: 'mem_1',
    memberPhone: '012345678',
    depositAppliedUsd: 0,
    totalUsd: 5,
    totalKhr: 20500,
    paidUsd: 5,
    paidKhr: 0,
    changeUsd: 0,
    changeKhr: 0,
    cashierName: 'Sokha',
    createdAt: '2026-11-17T12:00:00.000Z',
    updatedAt: '2026-11-17T12:00:00.000Z',
  };

  const offlineMember: MemberCustomer = {
    ...sampleMember,
    points: 300,
    totalSpentUsd: 520,
    tier: 'Gold',
  };

  const settled = settleMemberLoyalty({
    member: offlineMember,
    order,
    totalPaidUsd: 5,
    branch: { pointsEnabled: true, pointsPerDollar: 1, pointsValuePer100: 1 },
    offlineMode: true,
    nowIso: '2026-11-17T12:05:00.000Z',
  });

  // Gold earns floor(5 * 1.5) = 7 pts offline (syncs with state later);
  // the 100-pt redemption is held back until online
  assert.equal(settled.earnedPoints, 7);
  assert.equal(settled.discountPointsUsed, 0);
  assert.equal(settled.itemPointsUsed, 0);
  assert.equal(settled.balanceAfter, 307);
  const earnTx = settled.updatedMember.loyaltyHistory?.find((tx) => tx.type === 'earn');
  assert.ok(earnTx?.description.includes('(offline)'));
});
