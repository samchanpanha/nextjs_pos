import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../data/seedData';
import {
  buildShiftOptimizationFingerprint,
  buildShiftOptimizationPayload,
  normalizeAiShiftOptimizationReport,
} from './aiShiftOptimization';

describe('aiShiftOptimization utilities', () => {
  it('aggregates branch sales history, daypart traffic, and staff roles into a Gemini prompt payload', () => {
    const seed = createSeedState('restaurant');
    const branch = seed.branches.find((b) => b.id === 'branch_bkk1')!;
    const payload = buildShiftOptimizationPayload({
      branch,
      dailyRevenueHistory: seed.dailyRevenueHistory,
      orders: seed.orders,
      shifts: seed.shifts,
      staff: seed.staff,
      reservations: seed.reservations,
      referenceDate: '2026-11-18',
    });

    assert.equal(payload.branchId, 'branch_bkk1');
    assert.equal(payload.referenceDate, '2026-11-18');
    assert.equal(payload.daypartTraffic.length, 4);
    assert.equal(payload.targetShifts.length, 4);
    assert.ok(payload.avgDailyRevenueUsd > 0);
    assert.ok(payload.avgDailyOrders > 0);
    assert.ok(payload.currentBranchStaffCount >= 1);

    const fp1 = buildShiftOptimizationFingerprint(seed.tenantId, payload);
    const fp2 = buildShiftOptimizationFingerprint(seed.tenantId, payload);
    assert.equal(fp1, fp2);
  });

  it('normalizes structured Gemini staffing recommendations and aligns role totals', () => {
    const seed = createSeedState('restaurant');
    const branch = seed.branches.find((b) => b.id === 'branch_bkk1')!;
    const payload = buildShiftOptimizationPayload({
      branch,
      dailyRevenueHistory: seed.dailyRevenueHistory,
      orders: seed.orders,
      shifts: seed.shifts,
      staff: seed.staff,
      reservations: seed.reservations,
      referenceDate: '2026-11-18',
    });

    const report = normalizeAiShiftOptimizationReport(
      {
        summary: 'Peak dining demand concentrates in the lunch and evening windows.',
        peakWindow: '11:30 – 14:00 Lunch Rush',
        trafficTrend: 'growing',
        shiftRecommendations: [
          {
            shiftName: 'Midday Lunch Rush',
            timeWindow: '11:00 – 15:00',
            dayLabel: 'Tomorrow (Thu)',
            expectedTrafficLevel: 'high',
            expectedOrders: 28,
            expectedRevenueUsd: 195.5,
            recommendedTotalStaff: 5,
            roleBreakdown: { cashiers: 1, kitchen: 2, barOrFloor: 2, supervisor: 1 },
            rationale: 'Lunch orders represent the highest order share.',
          },
        ],
        optimizationActions: ['Stagger morning barista arrival by 30 minutes'],
      },
      {
        model: 'gemini-4-hydrogen',
        generatedAt: '2026-11-18T06:00:00.000Z',
        payload,
      }
    );

    assert.equal(report.model, 'gemini-4-hydrogen');
    assert.equal(report.trafficTrend, 'growing');
    assert.equal(report.shiftRecommendations.length, 4);
    const lunch = report.shiftRecommendations.find((s) => s.shiftName === 'Midday Lunch Rush')!;
    assert.equal(lunch.expectedTrafficLevel, 'high');
    assert.equal(lunch.recommendedTotalStaff, 6); // aligned to sum of roleBreakdown (1+2+2+1)
    assert.equal(lunch.expectedOrders, 28);
    assert.equal(lunch.expectedRevenueUsd, 195.5);
    assert.equal(report.optimizationActions.length, 1);
  });
});
