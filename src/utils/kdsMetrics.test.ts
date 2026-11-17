import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PosOrder } from '../types/pos';
import { calculateKdsPrepMetrics, formatPrepDuration } from './kdsMetrics';

function makeOrder(partial: Partial<PosOrder> & Pick<PosOrder, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'items'>): PosOrder {
  return {
    branchId: 'b1',
    orderNumber: 1,
    tableName: 'T01',
    channel: 'dine_in',
    guests: 2,
    currentRound: 1,
    manualDiscountPercent: 0,
    manualDiscountUsd: 0,
    promoDiscountUsd: 0,
    pointsRedeemed: 0,
    depositAppliedUsd: 0,
    totalUsd: 10,
    totalKhr: 41000,
    paidUsd: 0,
    paidKhr: 0,
    changeUsd: 0,
    changeKhr: 0,
    cashierName: 'Cashier',
    ...partial,
  };
}

describe('kdsMetrics utilities', () => {
  it('formats preparation durations cleanly across seconds, minutes, and hours', () => {
    assert.equal(formatPrepDuration(42), '42s');
    assert.equal(formatPrepDuration(125), '2m 05s');
    assert.equal(formatPrepDuration(900), '15m 00s');
    assert.equal(formatPrepDuration(3720), '1h 02m');
  });

  it('calculates Average Preparation Time, fastest/slowest, SLA rate, and station filtering', () => {
    const baseMs = Date.parse('2026-11-17T04:00:00Z');
    const orders: PosOrder[] = [
      // Kitchen completed in 12m (720s)
      makeOrder({
        id: 'o1',
        status: 'ready',
        createdAt: new Date(baseMs - 20 * 60000).toISOString(),
        kdsSubmittedAt: new Date(baseMs - 15 * 60000).toISOString(),
        updatedAt: new Date(baseMs - 3 * 60000).toISOString(),
        kdsCompletedAt: new Date(baseMs - 3 * 60000).toISOString(),
        items: [
          {
            id: 'i1',
            menuItemId: 'm1',
            nameEn: 'Lok Lak',
            nameKh: 'ឡុកឡាក់',
            nameVi: 'Bo',
            unitPriceUsd: 6.5,
            qty: 1,
            station: 'kitchen',
            category: 'Mains',
            round: 1,
            sentToKitchen: true,
            kdsStatus: 'ready',
          },
        ],
      }),
      // Bar completed in 6m (360s)
      makeOrder({
        id: 'o2',
        status: 'served',
        createdAt: new Date(baseMs - 10 * 60000).toISOString(),
        updatedAt: new Date(baseMs - 4 * 60000).toISOString(),
        items: [
          {
            id: 'i2',
            menuItemId: 'm2',
            nameEn: 'Iced Latte',
            nameKh: 'ឡាតេ',
            nameVi: 'Latte',
            unitPriceUsd: 3,
            qty: 1,
            station: 'bar',
            category: 'Coffee',
            round: 1,
            sentToKitchen: true,
            kdsStatus: 'served',
          },
        ],
      }),
      // Kitchen active cooking (waiting 8m)
      makeOrder({
        id: 'o3',
        status: 'cooking',
        createdAt: new Date(baseMs - 8 * 60000).toISOString(),
        updatedAt: new Date(baseMs - 5 * 60000).toISOString(),
        items: [
          {
            id: 'i3',
            menuItemId: 'm3',
            nameEn: 'Fish Amok',
            nameKh: 'អាម៉ុក',
            nameVi: 'Amok',
            unitPriceUsd: 6,
            qty: 1,
            station: 'kitchen',
            category: 'Mains',
            round: 1,
            sentToKitchen: true,
            kdsStatus: 'cooking',
          },
        ],
      }),
      // Voided order ignored
      makeOrder({
        id: 'o4',
        status: 'voided',
        createdAt: new Date(baseMs - 30 * 60000).toISOString(),
        updatedAt: new Date(baseMs - 5 * 60000).toISOString(),
        items: [
          {
            id: 'i4',
            menuItemId: 'm1',
            nameEn: 'Lok Lak',
            nameKh: 'ឡុកឡាក់',
            nameVi: 'Bo',
            unitPriceUsd: 6.5,
            qty: 1,
            station: 'kitchen',
            category: 'Mains',
            round: 1,
            sentToKitchen: true,
            kdsStatus: 'served',
          },
        ],
      }),
    ];

    const allMetrics = calculateKdsPrepMetrics({
      orders,
      branchId: 'b1',
      stationFilter: 'all',
      warnMinutes: 10,
      lateMinutes: 18,
      nowMs: baseMs,
    });
    // Completed: 12m (o1) + 6m (o2) -> avg 9.0m (9m 00s)
    assert.equal(allMetrics.completedCount, 2);
    assert.equal(allMetrics.avgPrepMinutes, 9);
    assert.equal(allMetrics.formattedAvgPrepTime, '9m 00s');
    assert.equal(allMetrics.fastestMinutes, 6);
    assert.equal(allMetrics.slowestMinutes, 12);
    assert.equal(allMetrics.withinTargetPct, 100);
    assert.equal(allMetrics.activeCount, 1);
    assert.equal(allMetrics.activeAvgWaitMinutes, 8);
    assert.equal(allMetrics.slaHealth, 'fast');

    const kitchenOnly = calculateKdsPrepMetrics({
      orders,
      branchId: 'b1',
      stationFilter: 'kitchen',
      warnMinutes: 10,
      lateMinutes: 18,
      nowMs: baseMs,
    });
    assert.equal(kitchenOnly.completedCount, 1);
    assert.equal(kitchenOnly.avgPrepMinutes, 12);
    assert.equal(kitchenOnly.slaHealth, 'warning'); // > 10m warn, <= 18m late

    const barOnly = calculateKdsPrepMetrics({
      orders,
      branchId: 'b1',
      stationFilter: 'bar',
      warnMinutes: 10,
      lateMinutes: 18,
      nowMs: baseMs,
    });
    assert.equal(barOnly.completedCount, 1);
    assert.equal(barOnly.avgPrepMinutes, 6);
    assert.equal(barOnly.activeCount, 0);
  });

  it('handles branches with no completed tickets gracefully', () => {
    const empty = calculateKdsPrepMetrics({
      orders: [],
      branchId: 'b_none',
    });
    assert.equal(empty.completedCount, 0);
    assert.equal(empty.avgPrepMinutes, null);
    assert.equal(empty.formattedAvgPrepTime, '—');
    assert.equal(empty.slaHealth, 'none');
  });
});
