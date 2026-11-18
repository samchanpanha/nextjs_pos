import type {
  BranchConfig,
  DailyRevenuePoint,
  PosOrder,
  Reservation,
  ShiftRecord,
  StaffMember,
} from '../types/pos';
import { roundCurrency } from './posMath';

export interface DaypartTrafficMetric {
  id: 'morning' | 'lunch' | 'afternoon' | 'evening';
  label: string;
  timeRange: string;
  orderCount: number;
  revenueUsd: number;
  guestCount: number;
  itemCount: number;
  avgTicketUsd: number;
  shareOfOrdersPct: number;
}

export interface StaffRoleCounts {
  cashiers: number;
  kitchen: number;
  barOrFloor: number;
  supervisor: number;
}

export interface ShiftOptimizationRequestPayload {
  branchId: string;
  branchName: string;
  referenceDate: string;
  exchangeRate: number;
  observedPeakWindow: string;
  avgDailyRevenueUsd: number;
  avgDailyOrders: number;
  weekendLiftPct: number;
  upcomingReservationsCount: number;
  closedShiftsSampled: number;
  currentBranchStaffCount: number;
  currentRoleCounts: StaffRoleCounts;
  daypartTraffic: DaypartTrafficMetric[];
  historicalDays: {
    date: string;
    weekday: string;
    netSalesUsd: number;
    ordersCount: number;
  }[];
  targetShifts: {
    shiftName: string;
    timeWindow: string;
    dayLabel: string;
  }[];
}

export interface AiShiftRecommendation {
  shiftName: string;
  timeWindow: string;
  dayLabel: string;
  expectedTrafficLevel: 'high' | 'moderate' | 'low';
  expectedOrders: number;
  expectedRevenueUsd: number;
  recommendedTotalStaff: number;
  roleBreakdown: StaffRoleCounts;
  rationale: string;
}

export interface AiShiftOptimizationReport {
  summary: string;
  peakWindow: string;
  trafficTrend: 'growing' | 'steady' | 'variable';
  observedPeakWindow: string;
  avgDailyOrders: number;
  currentBranchStaffCount: number;
  shiftRecommendations: AiShiftRecommendation[];
  optimizationActions: string[];
  model: string;
  generatedAt: string;
}

export interface RawGeminiShiftOptimizationPayload {
  summary?: string;
  peakWindow?: string;
  trafficTrend?: string;
  shiftRecommendations?: {
    shiftName?: string;
    timeWindow?: string;
    dayLabel?: string;
    expectedTrafficLevel?: string;
    expectedOrders?: number;
    expectedRevenueUsd?: number;
    recommendedTotalStaff?: number;
    roleBreakdown?: {
      cashiers?: number;
      kitchen?: number;
      barOrFloor?: number;
      supervisor?: number;
    };
    rationale?: string;
  }[];
  optimizationActions?: string[];
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function classifyDaypart(hour: number): 'morning' | 'lunch' | 'afternoon' | 'evening' {
  if (hour >= 6 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'afternoon';
  return 'evening';
}

const DAYPART_DEFS: {
  id: 'morning' | 'lunch' | 'afternoon' | 'evening';
  label: string;
  timeRange: string;
}[] = [
  { id: 'morning', label: 'Morning Open', timeRange: '06:00 – 11:00' },
  { id: 'lunch', label: 'Lunch Rush', timeRange: '11:00 – 15:00' },
  { id: 'afternoon', label: 'Afternoon Café', timeRange: '15:00 – 18:00' },
  { id: 'evening', label: 'Dinner Peak', timeRange: '18:00 – 22:30' },
];

export function buildShiftOptimizationPayload(input: {
  branch: BranchConfig;
  dailyRevenueHistory: DailyRevenuePoint[];
  orders: PosOrder[];
  shifts: ShiftRecord[];
  staff: StaffMember[];
  reservations: Reservation[];
  referenceDate?: string;
}): ShiftOptimizationRequestPayload {
  const referenceDate = input.referenceDate || new Date().toISOString().slice(0, 10);
  const refDateObj = new Date(`${referenceDate}T12:00:00Z`);
  const tomorrowObj = new Date(refDateObj.getTime() + 86400000);
  const tomorrowWeekday = WEEKDAY_NAMES[tomorrowObj.getUTCDay()] || 'Next Day';

  const branchOrders = input.orders.filter(
    (o) => o.branchId === input.branch.id && o.status !== 'voided'
  );

  const buckets: Record<
    'morning' | 'lunch' | 'afternoon' | 'evening',
    { orders: number; rev: number; guests: number; items: number }
  > = {
    morning: { orders: 0, rev: 0, guests: 0, items: 0 },
    lunch: { orders: 0, rev: 0, guests: 0, items: 0 },
    afternoon: { orders: 0, rev: 0, guests: 0, items: 0 },
    evening: { orders: 0, rev: 0, guests: 0, items: 0 },
  };

  for (const ord of branchOrders) {
    const dt = new Date(ord.createdAt);
    const hr = Number.isNaN(dt.getTime()) ? 12 : dt.getHours();
    const part = classifyDaypart(hr);
    const activeItemCount = ord.items
      .filter((i) => !i.voided)
      .reduce((s, i) => s + Math.max(0, i.qty), 0);
    buckets[part].orders += 1;
    buckets[part].rev += Math.max(0, Number(ord.totalUsd) || 0);
    buckets[part].guests += Math.max(1, Number(ord.guests) || 1);
    buckets[part].items += activeItemCount;
  }

  const totalBranchOrders = branchOrders.length;
  const daypartTraffic: DaypartTrafficMetric[] = DAYPART_DEFS.map((def) => {
    const b = buckets[def.id];
    return {
      id: def.id,
      label: def.label,
      timeRange: def.timeRange,
      orderCount: b.orders,
      revenueUsd: roundCurrency(b.rev),
      guestCount: b.guests,
      itemCount: b.items,
      avgTicketUsd: b.orders > 0 ? roundCurrency(b.rev / b.orders) : 0,
      shareOfOrdersPct:
        totalBranchOrders > 0 ? Math.round((b.orders / totalBranchOrders) * 100) : 0,
    };
  });

  const sortedByTraffic = [...daypartTraffic].sort((a, b) =>
    b.orderCount !== a.orderCount ? b.orderCount - a.orderCount : b.revenueUsd - a.revenueUsd
  );
  const topBucket = sortedByTraffic[0];
  const observedPeakWindow =
    topBucket && topBucket.orderCount > 0
      ? `${topBucket.label} (${topBucket.timeRange})`
      : 'Lunch Rush (11:00 – 15:00)';

  const parseHistoryWeekday = (dateStr: string): string => {
    const trimmed = dateStr.trim();
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (isoMatch) {
      const dt = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
      return WEEKDAY_NAMES[dt.getUTCDay()] || 'Day';
    }
    const dmMatch = /^(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
    if (dmMatch) {
      const yr = refDateObj.getUTCFullYear();
      const dt = new Date(Date.UTC(yr, Number(dmMatch[2]) - 1, Number(dmMatch[1])));
      return WEEKDAY_NAMES[dt.getUTCDay()] || 'Day';
    }
    return 'Day';
  };

  const sortedHistory = input.dailyRevenueHistory
    .slice(-14)
    .map((d) => ({
      date: d.date,
      weekday: parseHistoryWeekday(d.date),
      netSalesUsd: roundCurrency(Number(d.netSalesUsd) || 0),
      ordersCount: Math.max(0, Math.round(Number(d.bills) || 0)),
      guestsCount: Math.max(0, Math.round(Number(d.guests) || 0)),
    }));

  const avgDailyRevenueUsd =
    sortedHistory.length > 0
      ? roundCurrency(
          sortedHistory.reduce((s, d) => s + d.netSalesUsd, 0) / sortedHistory.length
        )
      : roundCurrency(branchOrders.reduce((s, o) => s + o.totalUsd, 0));

  const avgDailyOrders =
    sortedHistory.length > 0
      ? Math.round(
          sortedHistory.reduce((s, d) => s + d.ordersCount, 0) / sortedHistory.length
        )
      : totalBranchOrders;

  const weekendDays = sortedHistory.filter((d) => d.weekday === 'Sat' || d.weekday === 'Sun');
  const weekdayDays = sortedHistory.filter((d) => d.weekday !== 'Sat' && d.weekday !== 'Sun');
  const wkndAvg =
    weekendDays.length > 0
      ? weekendDays.reduce((s, d) => s + d.netSalesUsd, 0) / weekendDays.length
      : avgDailyRevenueUsd;
  const wkdayAvg =
    weekdayDays.length > 0
      ? weekdayDays.reduce((s, d) => s + d.netSalesUsd, 0) / weekdayDays.length
      : avgDailyRevenueUsd;
  const weekendLiftPct =
    wkdayAvg > 0 ? Math.round(((wkndAvg - wkdayAvg) / wkdayAvg) * 100) : 0;

  const activeBranchStaff = input.staff.filter((s) => {
    const scopedBranchId = (s as StaffMember & { branchId?: string }).branchId;
    return s.active && (!scopedBranchId || scopedBranchId === input.branch.id);
  });
  const currentRoleCounts: StaffRoleCounts = {
    cashiers: activeBranchStaff.filter((s) => s.role === 'cashier').length,
    kitchen: activeBranchStaff.filter((s) => s.role === 'kitchen').length,
    barOrFloor: activeBranchStaff.filter((s) => s.role === 'waiter').length,
    supervisor: activeBranchStaff.filter((s) => s.role === 'owner' || s.role === 'manager').length,
  };

  const upcomingReservationsCount = input.reservations.filter(
    (r) => r.branchId === input.branch.id && (r.status === 'confirmed' || r.status === 'pending')
  ).length;

  const closedShiftsSampled = input.shifts.filter(
    (s) => s.branchId === input.branch.id && s.status === 'closed'
  ).length;

  const targetShifts = [
    {
      shiftName: 'Morning Open & Prep',
      timeWindow: '07:00 – 11:00',
      dayLabel: `Tomorrow (${tomorrowWeekday})`,
    },
    {
      shiftName: 'Midday Lunch Rush',
      timeWindow: '11:00 – 15:00',
      dayLabel: `Tomorrow (${tomorrowWeekday})`,
    },
    {
      shiftName: 'Afternoon Café Shift',
      timeWindow: '15:00 – 18:00',
      dayLabel: `Tomorrow (${tomorrowWeekday})`,
    },
    {
      shiftName: 'Evening Dinner Service',
      timeWindow: '18:00 – 22:30',
      dayLabel: `Tomorrow (${tomorrowWeekday})`,
    },
  ];

  return {
    branchId: input.branch.id,
    branchName: input.branch.name,
    referenceDate,
    exchangeRate: input.branch.exchangeRate,
    observedPeakWindow,
    avgDailyRevenueUsd,
    avgDailyOrders,
    weekendLiftPct,
    upcomingReservationsCount,
    closedShiftsSampled,
    currentBranchStaffCount: activeBranchStaff.length,
    currentRoleCounts,
    daypartTraffic,
    historicalDays: sortedHistory,
    targetShifts,
  };
}

export function buildShiftOptimizationFingerprint(
  tenantId: string | undefined,
  payload: ShiftOptimizationRequestPayload
): string {
  const historySig = payload.historicalDays
    .slice(-7)
    .map((d) => `${d.date}:${d.netSalesUsd.toFixed(0)}:${d.ordersCount}`)
    .join('|');
  const trafficSig = payload.daypartTraffic
    .map((t) => `${t.id}:${t.orderCount}:${t.revenueUsd.toFixed(0)}`)
    .join('|');
  return [
    tenantId ?? 'default',
    payload.branchId,
    payload.referenceDate,
    payload.currentBranchStaffCount,
    payload.upcomingReservationsCount,
    historySig,
    trafficSig,
  ].join('::');
}

function clampInt(val: unknown, fallback: number, min = 0, max = 99): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : fallback;
  return Math.max(min, Math.min(max, n));
}

export function normalizeAiShiftOptimizationReport(
  raw: RawGeminiShiftOptimizationPayload,
  meta: {
    model: string;
    generatedAt: string;
    payload: ShiftOptimizationRequestPayload;
  }
): AiShiftOptimizationReport {
  const rawList = Array.isArray(raw.shiftRecommendations) ? raw.shiftRecommendations : [];
  const shiftRecommendations: AiShiftRecommendation[] = meta.payload.targetShifts.map(
    (target, idx) => {
      const candidate =
        rawList.find(
          (r) =>
            r.shiftName?.toLowerCase().trim() === target.shiftName.toLowerCase().trim() ||
            r.timeWindow?.trim() === target.timeWindow.trim()
        ) || rawList[idx];

      const rawLevel = String(candidate?.expectedTrafficLevel || '').toLowerCase();
      const expectedTrafficLevel: 'high' | 'moderate' | 'low' =
        rawLevel === 'high' || rawLevel === 'low' ? rawLevel : 'moderate';

      const cashiers = clampInt(candidate?.roleBreakdown?.cashiers, 1, 0, 20);
      const kitchen = clampInt(candidate?.roleBreakdown?.kitchen, 1, 0, 20);
      const barOrFloor = clampInt(candidate?.roleBreakdown?.barOrFloor, 1, 0, 20);
      const supervisor = clampInt(candidate?.roleBreakdown?.supervisor, 0, 0, 10);
      const roleSum = cashiers + kitchen + barOrFloor + supervisor;
      const recommendedTotalStaff = Math.max(
        1,
        clampInt(candidate?.recommendedTotalStaff, Math.max(1, roleSum), 1, 50)
      );

      const expectedOrders = clampInt(
        candidate?.expectedOrders,
        Math.max(1, Math.round(meta.payload.avgDailyOrders / 4)),
        0,
        500
      );
      const rawRev =
        typeof candidate?.expectedRevenueUsd === 'number' &&
        Number.isFinite(candidate.expectedRevenueUsd)
          ? Math.max(0, candidate.expectedRevenueUsd)
          : roundCurrency(meta.payload.avgDailyRevenueUsd / 4);

      return {
        shiftName: candidate?.shiftName?.trim() || target.shiftName,
        timeWindow: candidate?.timeWindow?.trim() || target.timeWindow,
        dayLabel: candidate?.dayLabel?.trim() || target.dayLabel,
        expectedTrafficLevel,
        expectedOrders,
        expectedRevenueUsd: roundCurrency(rawRev),
        recommendedTotalStaff: roleSum > 0 ? roleSum : recommendedTotalStaff,
        roleBreakdown: { cashiers, kitchen, barOrFloor, supervisor },
        rationale:
          candidate?.rationale?.trim() ||
          'Balanced floor and kitchen coverage based on historical shift demand.',
      };
    }
  );

  const rawTrend = String(raw.trafficTrend || '').toLowerCase();
  const trafficTrend: 'growing' | 'steady' | 'variable' =
    rawTrend === 'growing' || rawTrend === 'variable' ? rawTrend : 'steady';

  const optimizationActions = Array.isArray(raw.optimizationActions)
    ? raw.optimizationActions.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 4)
    : [];

  return {
    summary:
      raw.summary?.trim() ||
      `Staffing recommendations calibrated for ${meta.payload.branchName} around peak demand during ${meta.payload.observedPeakWindow}.`,
    peakWindow: raw.peakWindow?.trim() || meta.payload.observedPeakWindow,
    trafficTrend,
    observedPeakWindow: meta.payload.observedPeakWindow,
    avgDailyOrders: meta.payload.avgDailyOrders,
    currentBranchStaffCount: meta.payload.currentBranchStaffCount,
    shiftRecommendations,
    optimizationActions,
    model: meta.model,
    generatedAt: meta.generatedAt,
  };
}
