import test from 'node:test';
import assert from 'node:assert/strict';
import type { PosOrder } from '../types/pos';
import { computeDailySalesSummary, resolveDailySalesTargetUsd } from './dailySalesSummary';

function makeOrder(overrides: Partial<PosOrder>): PosOrder {
  return {
    id: 'ord_1',
    branchId: 'b1',
    orderNumber: 101,
    tableName: 'T01',
    channel: 'dine_in',
    status: 'paid',
    guests: 2,
    items: [],
    currentRound: 1,
    manualDiscountPercent: 0,
    manualDiscountUsd: 0,
    promoDiscountUsd: 0,
    pointsRedeemed: 0,
    depositAppliedUsd: 0,
    totalUsd: 25,
    totalKhr: 102500,
    paidUsd: 25,
    paidKhr: 0,
    changeUsd: 0,
    changeKhr: 0,
    cashierName: 'Staff',
    createdAt: '2026-11-17T08:00:00',
    updatedAt: '2026-11-17T08:30:00',
    closedAt: '2026-11-17T08:30:00',
    ...overrides,
  };
}

test('resolveDailySalesTargetUsd prefers explicit branch target, else derives from history or defaults to $250', () => {
  assert.deepEqual(
    resolveDailySalesTargetUsd({ branchTargetUsd: 400 }),
    { targetUsd: 400, isCustomTarget: true }
  );

  const derived = resolveDailySalesTargetUsd({
    dailyRevenueHistory: [
      { date: '15/11', netSalesUsd: 200, bills: 15, guests: 30 },
      { date: '16/11', netSalesUsd: 250, bills: 18, guests: 34 },
    ],
  });
  assert.equal(derived.isCustomTarget, false);
  assert.equal(derived.targetUsd, 250);

  assert.deepEqual(resolveDailySalesTargetUsd({}), {
    targetUsd: 250,
    isCustomTarget: false,
  });
});

test('computeDailySalesSummary sums only today paid branch orders and separates open pipeline', () => {
  const summary = computeDailySalesSummary({
    branch: {
      id: 'b1',
      exchangeRate: 4100,
      rielRounding: 100,
      dailySalesTargetUsd: 200,
    },
    referenceDateYmd: '2026-11-17',
    orders: [
      makeOrder({ id: 'o1', totalUsd: 60, status: 'paid', closedAt: '2026-11-17T09:15:00' }),
      makeOrder({ id: 'o2', totalUsd: 45, status: 'paid', closedAt: '2026-11-17T11:00:00' }),
      makeOrder({ id: 'o_yesterday', totalUsd: 99, status: 'paid', closedAt: '2026-11-16T21:00:00' }),
      makeOrder({ id: 'o_voided', totalUsd: 80, status: 'voided', closedAt: '2026-11-17T10:00:00' }),
      makeOrder({ id: 'o_other_branch', branchId: 'b2', totalUsd: 120, status: 'paid' }),
      makeOrder({ id: 'o_open', totalUsd: 32.5, status: 'sent', closedAt: undefined }),
    ],
  });

  assert.equal(summary.revenueUsd, 105);
  assert.equal(summary.revenueKhr, 430500);
  assert.equal(summary.targetUsd, 200);
  assert.equal(summary.paidBillsCount, 2);
  assert.equal(summary.avgBillUsd, 52.5);
  assert.equal(summary.percentAchieved, 52.5);
  assert.equal(summary.progressBarPct, 53);
  assert.equal(summary.remainingUsd, 95);
  assert.equal(summary.surplusUsd, 0);
  assert.equal(summary.openOrdersCount, 1);
  assert.equal(summary.openPipelineUsd, 32.5);
  assert.equal(summary.tier, 'halfway');
});

test('computeDailySalesSummary celebrates surpassed targets with surplusUsd and capped bar width', () => {
  const summary = computeDailySalesSummary({
    branch: {
      id: 'b1',
      exchangeRate: 4100,
      rielRounding: 100,
      dailySalesTargetUsd: 100,
    },
    referenceDateYmd: '2026-11-17',
    orders: [
      makeOrder({ id: 'o1', totalUsd: 80, status: 'paid', closedAt: '2026-11-17T10:00:00' }),
      makeOrder({ id: 'o2', totalUsd: 52.5, status: 'paid', closedAt: '2026-11-17T12:00:00' }),
    ],
  });

  assert.equal(summary.revenueUsd, 132.5);
  assert.equal(summary.percentAchieved, 132.5);
  assert.equal(summary.progressBarPct, 100);
  assert.equal(summary.remainingUsd, 0);
  assert.equal(summary.surplusUsd, 32.5);
  assert.equal(summary.tier, 'achieved');
  assert.equal(summary.tierLabel, 'Target hit!');
});
