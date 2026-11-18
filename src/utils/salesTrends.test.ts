import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../data/seedData';
import { buildThirtyDaySalesSeries } from './salesTrends';

describe('salesTrends utilities', () => {
  it('builds a chronological 30-day series and summarizes peak day and peak business hour', () => {
    const seed = createSeedState('restaurant');
    const report = buildThirtyDaySalesSeries({
      dailyRevenueHistory: seed.dailyRevenueHistory,
      orders: seed.orders,
      branchId: 'branch_bkk1',
      referenceDateIso: '2026-11-18',
    });

    assert.equal(report.points.length, 30);
    assert.equal(report.points[29].isToday, true);
    assert.ok(report.total30dUsd > 0);
    assert.ok(report.avgDailyUsd > 0);
    assert.ok(report.peakDay.netSalesUsd >= 382.4);
    assert.equal(report.hourlyTraffic.length, 16);
    assert.ok(report.peakHourOrders >= 1);
  });

  it('handles empty history gracefully without NaN values', () => {
    const report = buildThirtyDaySalesSeries({
      dailyRevenueHistory: [],
      orders: [],
      branchId: 'branch_empty',
      referenceDateIso: '2026-11-18',
    });

    assert.equal(report.points.length, 30);
    assert.equal(report.total30dUsd, 0);
    assert.equal(report.avgDailyUsd, 0);
    assert.equal(report.recordedDaysCount, 0);
  });
});
