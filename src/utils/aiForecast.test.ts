import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForecastFingerprint,
  buildForecastHistoryPayload,
  buildUpcomingForecastDates,
  normalizeAiForecastReport,
} from './aiForecast';
import type { PosOrder } from '../types/pos';

const sampleBranch = {
  id: 'br_1',
  name: 'Toul Kork Flagship',
  exchangeRate: 4100,
  rielRounding: 100,
};

function makePaidOrder(id: string, totalUsd: number): PosOrder {
  return {
    id,
    branchId: 'br_1',
    orderNumber: 101,
    tableName: 'T1',
    channel: 'dine_in',
    status: 'paid',
    guests: 2,
    items: [
      {
        id: 'li_1',
        menuItemId: 'm_amok',
        nameEn: 'Fish Amok',
        nameKh: 'អាម៉ុកត្រី',
        nameVi: 'Cá Amok',
        unitPriceUsd: totalUsd,
        qty: 1,
        station: 'kitchen',
        category: 'Main dishes',
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
    totalUsd,
    totalKhr: totalUsd * 4100,
    paidUsd: totalUsd,
    paidKhr: 0,
    changeUsd: 0,
    changeKhr: 0,
    cashierName: 'Sokha',
    createdAt: '2026-11-17T08:00:00.000Z',
    updatedAt: '2026-11-17T08:30:00.000Z',
  };
}

test('buildUpcomingForecastDates produces exact sequential 7 calendar days', () => {
  const dates = buildUpcomingForecastDates('2026-11-17', 7);
  assert.equal(dates.length, 7);
  assert.equal(dates[0].date, '2026-11-18');
  assert.equal(dates[0].dayLabel, 'Wed');
  assert.equal(dates[6].date, '2026-11-24');
  assert.equal(dates[6].dayLabel, 'Tue');
});

test('buildForecastHistoryPayload merges branch orders with historical revenue points', () => {
  const history = [
    { date: '2026-11-11', netSalesUsd: 320, bills: 20, guests: 38 },
    { date: '2026-11-12', netSalesUsd: 340, bills: 22, guests: 41 },
    { date: '2026-11-13', netSalesUsd: 310, bills: 19, guests: 35 },
    { date: '2026-11-14', netSalesUsd: 390, bills: 24, guests: 47 },
    { date: '2026-11-15', netSalesUsd: 460, bills: 29, guests: 56 },
    { date: '2026-11-16', netSalesUsd: 480, bills: 31, guests: 60 },
    { date: '2026-11-17', netSalesUsd: 100, bills: 5, guests: 10 },
  ];
  const orders: PosOrder[] = [
    makePaidOrder('ord_1', 75),
    makePaidOrder('ord_2', 65),
    { ...makePaidOrder('ord_other_branch', 999), branchId: 'br_other' },
  ];

  const payload = buildForecastHistoryPayload({
    branch: sampleBranch,
    dailyRevenueHistory: history,
    orders,
    referenceDateIso: '2026-11-17',
  });

  assert.equal(payload.todayCollectedUsd, 140);
  assert.equal(payload.todayPaidBills, 2);
  assert.equal(payload.avgBillUsd, 70);
  assert.equal(payload.upcomingDates.length, 7);
  assert.equal(payload.upcomingDates[0].date, '2026-11-18');
  // Today's merged point should reflect max(100, 140) = 140
  const todayPoint = payload.historicalDays.find((d) => d.date === '2026-11-17');
  assert.equal(todayPoint?.netSalesUsd, 140);
  assert.equal(payload.prior7DayTotalUsd, 2440);
  assert.equal(payload.topItems[0]?.name, 'Fish Amok');
  assert.equal(payload.topItems[0]?.qty, 2);
});

test('normalizeAiForecastReport anchors days, bounds confidence intervals, and converts KHR', () => {
  const upcomingDates = buildUpcomingForecastDates('2026-11-17', 7);
  const report = normalizeAiForecastReport(
    {
      summary: 'Strong weekend demand pushes 7-day projection higher.',
      trendDirection: 'up',
      keyDrivers: ['Fri-Sun dining surge', 'High Fish Amok attach rate'],
      recommendations: ['Prep extra seafood for Friday dinner'],
      days: upcomingDates.map((d, idx) => ({
        date: d.date,
        dayLabel: d.dayLabel,
        predictedRevenueUsd: 400 + idx * 25,
        lowUsd: 380 + idx * 20,
        highUsd: 430 + idx * 30,
        confidencePct: idx === 0 ? 120 : 82, // 120 should clamp to 99
        driverNote: `Driver ${idx + 1}`,
      })),
    },
    {
      model: 'gemini-4-hydrogen',
      exchangeRate: 4100,
      rielRounding: 100,
      prior7DayTotalUsd: 2800,
      upcomingDates,
    }
  );

  assert.equal(report.days.length, 7);
  assert.equal(report.days[0].confidencePct, 99);
  assert.equal(report.predictedTotalUsd, 3325);
  assert.equal(report.predictedTotalKhr, 3325 * 4100);
  assert.equal(report.peakDay?.date, '2026-11-24');
  assert.equal(report.peakDay?.predictedRevenueUsd, 550);
  assert.ok(report.projectedChangePct > 0);
  assert.equal(report.trendDirection, 'up');
});

test('buildForecastFingerprint changes when live paid revenue changes', () => {
  const base = buildForecastHistoryPayload({
    branch: sampleBranch,
    dailyRevenueHistory: [{ date: '2026-11-17', netSalesUsd: 100, bills: 4, guests: 8 }],
    orders: [makePaidOrder('ord_1', 50)],
    referenceDateIso: '2026-11-17',
  });
  const updated = buildForecastHistoryPayload({
    branch: sampleBranch,
    dailyRevenueHistory: [{ date: '2026-11-17', netSalesUsd: 100, bills: 4, guests: 8 }],
    orders: [makePaidOrder('ord_1', 50), makePaidOrder('ord_2', 80)],
    referenceDateIso: '2026-11-17',
  });

  assert.notEqual(
    buildForecastFingerprint('ten_1', base),
    buildForecastFingerprint('ten_1', updated)
  );
});
