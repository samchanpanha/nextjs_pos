import type { BranchConfig, DailyRevenuePoint, PosOrder } from '../types/pos';
import { roundCurrency, usdToKhr } from './posMath';

export type MotivationTier = 'starting' | 'momentum' | 'halfway' | 'close' | 'achieved';

export interface DailySalesSummary {
  dateYmd: string;
  revenueUsd: number;
  revenueKhr: number;
  targetUsd: number;
  targetKhr: number;
  isCustomTarget: boolean;
  percentAchieved: number;
  progressBarPct: number;
  remainingUsd: number;
  surplusUsd: number;
  paidBillsCount: number;
  avgBillUsd: number;
  openOrdersCount: number;
  openPipelineUsd: number;
  tier: MotivationTier;
  tierLabel: string;
  motivationalMessage: string;
}

export function formatLocalYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getOrderLocalYmd(order: Pick<PosOrder, 'closedAt' | 'updatedAt' | 'createdAt'>): string | null {
  const raw = order.closedAt || order.updatedAt || order.createdAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatLocalYmd(parsed);
}

export function resolveDailySalesTargetUsd(input: {
  branchTargetUsd?: number;
  dailyRevenueHistory?: DailyRevenuePoint[];
}): { targetUsd: number; isCustomTarget: boolean } {
  const explicit = Number(input.branchTargetUsd);
  if (Number.isFinite(explicit) && explicit > 0) {
    return { targetUsd: roundCurrency(explicit), isCustomTarget: true };
  }

  const history = (input.dailyRevenueHistory || []).filter(
    (d) => Number.isFinite(d.netSalesUsd) && d.netSalesUsd > 0
  );
  if (history.length > 0) {
    const avg = history.reduce((sum, d) => sum + d.netSalesUsd, 0) / history.length;
    const roundedTarget = Math.max(100, Math.ceil((avg * 1.1) / 25) * 25);
    return { targetUsd: roundedTarget, isCustomTarget: false };
  }

  return { targetUsd: 250, isCustomTarget: false };
}

export function getMotivationMeta(input: {
  percentAchieved: number;
  remainingUsd: number;
  surplusUsd: number;
}): {
  tier: MotivationTier;
  tierLabel: string;
  motivationalMessage: string;
} {
  const { percentAchieved, remainingUsd, surplusUsd } = input;
  if (percentAchieved >= 100) {
    return {
      tier: 'achieved',
      tierLabel: 'Target hit!',
      motivationalMessage:
        surplusUsd > 0
          ? `+$${surplusUsd.toFixed(2)} above today's goal — great team effort!`
          : "Daily goal reached — keep the momentum going!",
    };
  }
  if (percentAchieved >= 80) {
    return {
      tier: 'close',
      tierLabel: 'Almost there',
      motivationalMessage: `Only $${remainingUsd.toFixed(2)} left to hit today's goal!`,
    };
  }
  if (percentAchieved >= 50) {
    return {
      tier: 'halfway',
      tierLabel: 'On track',
      motivationalMessage: `Past halfway — $${remainingUsd.toFixed(2)} remaining to goal.`,
    };
  }
  if (percentAchieved >= 20) {
    return {
      tier: 'momentum',
      tierLabel: 'Building pace',
      motivationalMessage: `Nice pace — $${remainingUsd.toFixed(2)} to reach today's target.`,
    };
  }
  return {
    tier: 'starting',
    tierLabel: 'Shift underway',
    motivationalMessage: `$${remainingUsd.toFixed(2)} to today's goal — suggest pairings to lift tickets.`,
  };
}

export function computeDailySalesSummary(input: {
  branch: Pick<BranchConfig, 'id' | 'exchangeRate' | 'rielRounding' | 'dailySalesTargetUsd'>;
  orders: PosOrder[];
  dailyRevenueHistory?: DailyRevenuePoint[];
  referenceDateYmd?: string;
}): DailySalesSummary {
  const dateYmd = input.referenceDateYmd || formatLocalYmd(new Date());
  const branchOrders = input.orders.filter((o) => o.branchId === input.branch.id);

  const paidTodayOrders = branchOrders.filter((o) => {
    if (o.status !== 'paid') return false;
    const orderDay = getOrderLocalYmd(o);
    return orderDay === null || orderDay === dateYmd;
  });

  const openOrders = branchOrders.filter(
    (o) => o.status !== 'paid' && o.status !== 'voided'
  );

  const revenueUsd = roundCurrency(
    paidTodayOrders.reduce(
      (sum, o) => sum + (Number.isFinite(o.totalUsd) ? Math.max(0, o.totalUsd) : 0),
      0
    )
  );
  const revenueKhr = usdToKhr(
    revenueUsd,
    input.branch.exchangeRate,
    input.branch.rielRounding
  );

  const { targetUsd, isCustomTarget } = resolveDailySalesTargetUsd({
    branchTargetUsd: input.branch.dailySalesTargetUsd,
    dailyRevenueHistory: input.dailyRevenueHistory,
  });
  const targetKhr = usdToKhr(
    targetUsd,
    input.branch.exchangeRate,
    input.branch.rielRounding
  );

  const rawPct = targetUsd > 0 ? (revenueUsd / targetUsd) * 100 : 0;
  const percentAchieved = Math.round(rawPct * 10) / 10;
  const progressBarPct = Math.min(100, Math.max(0, Math.round(rawPct)));
  const remainingUsd = roundCurrency(Math.max(0, targetUsd - revenueUsd));
  const surplusUsd = roundCurrency(Math.max(0, revenueUsd - targetUsd));

  const paidBillsCount = paidTodayOrders.length;
  const avgBillUsd =
    paidBillsCount > 0 ? roundCurrency(revenueUsd / paidBillsCount) : 0;

  const openOrdersCount = openOrders.length;
  const openPipelineUsd = roundCurrency(
    openOrders.reduce(
      (sum, o) => sum + (Number.isFinite(o.totalUsd) ? Math.max(0, o.totalUsd) : 0),
      0
    )
  );

  const { tier, tierLabel, motivationalMessage } = getMotivationMeta({
    percentAchieved,
    remainingUsd,
    surplusUsd,
  });

  return {
    dateYmd,
    revenueUsd,
    revenueKhr,
    targetUsd,
    targetKhr,
    isCustomTarget,
    percentAchieved,
    progressBarPct,
    remainingUsd,
    surplusUsd,
    paidBillsCount,
    avgBillUsd,
    openOrdersCount,
    openPipelineUsd,
    tier,
    tierLabel,
    motivationalMessage,
  };
}
