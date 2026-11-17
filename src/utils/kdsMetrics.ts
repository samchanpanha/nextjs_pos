import type { PosOrder } from '../types/pos';

export type KdsStationFilter = 'all' | 'kitchen' | 'bar';
export type KdsSlaHealth = 'fast' | 'warning' | 'slow' | 'none';

export interface KdsPrepMetricsResult {
  completedCount: number;
  avgPrepSeconds: number | null;
  avgPrepMinutes: number | null;
  formattedAvgPrepTime: string;
  fastestMinutes: number | null;
  slowestMinutes: number | null;
  withinTargetPct: number | null;
  activeCount: number;
  activeAvgWaitMinutes: number | null;
  slaHealth: KdsSlaHealth;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function formatPrepDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins === 0) return `${secs}s`;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${String(remMins).padStart(2, '0')}m`;
  }
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export function calculateKdsPrepMetrics(input: {
  orders: PosOrder[];
  branchId: string;
  stationFilter?: KdsStationFilter;
  warnMinutes?: number;
  lateMinutes?: number;
  nowMs?: number;
}): KdsPrepMetricsResult {
  const stationFilter = input.stationFilter ?? 'all';
  const warnMinutes = Math.max(1, input.warnMinutes ?? 10);
  const lateMinutes = Math.max(warnMinutes, input.lateMinutes ?? 18);
  const nowMs = input.nowMs ?? Date.now();

  const completedDurationsSec: number[] = [];
  const activeWaitsMin: number[] = [];

  for (const ord of input.orders) {
    if (ord.branchId !== input.branchId || ord.status === 'voided') continue;

    const matchingSentItems = ord.items.filter(
      (i) =>
        i.sentToKitchen &&
        !i.voided &&
        (stationFilter === 'all' || i.station === stationFilter)
    );
    if (matchingSentItems.length === 0) continue;

    const submittedIso = ord.kdsSubmittedAt || ord.createdAt;
    const submittedMs = Date.parse(submittedIso);
    if (!Number.isFinite(submittedMs)) continue;

    const allCompletedByItem = matchingSentItems.every(
      (i) => i.kdsStatus === 'ready' || i.kdsStatus === 'served'
    );
    const isOrderCompletedStatus =
      ord.status === 'ready' || ord.status === 'served' || ord.status === 'paid';

    if (allCompletedByItem || isOrderCompletedStatus) {
      const completedIso = ord.kdsCompletedAt || ord.updatedAt || ord.closedAt;
      const completedMs = completedIso ? Date.parse(completedIso) : NaN;
      if (Number.isFinite(completedMs) && completedMs >= submittedMs) {
        const diffSec = (completedMs - submittedMs) / 1000;
        // Ignore multi-day anomalies (> 12h) to keep average representative of service shift
        if (diffSec > 0 && diffSec <= 12 * 3600) {
          completedDurationsSec.push(diffSec);
        } else if (diffSec === 0 && ord.kdsCompletedAt) {
          completedDurationsSec.push(1);
        }
      }
    } else if (ord.status !== 'paid') {
      const elapsedMin = Math.max(0, (nowMs - submittedMs) / 60000);
      if (elapsedMin <= 12 * 60) {
        activeWaitsMin.push(elapsedMin);
      }
    }
  }

  const completedCount = completedDurationsSec.length;
  const activeCount = activeWaitsMin.length;
  const activeAvgWaitMinutes =
    activeCount > 0
      ? roundTo(activeWaitsMin.reduce((s, v) => s + v, 0) / activeCount, 1)
      : null;

  if (completedCount === 0) {
    return {
      completedCount: 0,
      avgPrepSeconds: null,
      avgPrepMinutes: null,
      formattedAvgPrepTime: '—',
      fastestMinutes: null,
      slowestMinutes: null,
      withinTargetPct: null,
      activeCount,
      activeAvgWaitMinutes,
      slaHealth: 'none',
    };
  }

  const totalSec = completedDurationsSec.reduce((s, v) => s + v, 0);
  const avgPrepSeconds = Math.round(totalSec / completedCount);
  const avgPrepMinutes = roundTo(avgPrepSeconds / 60, 1);
  const minSec = Math.min(...completedDurationsSec);
  const maxSec = Math.max(...completedDurationsSec);
  const onTimeCount = completedDurationsSec.filter((s) => s / 60 <= lateMinutes).length;
  const withinTargetPct = Math.round((onTimeCount / completedCount) * 100);

  const slaHealth: KdsSlaHealth =
    avgPrepMinutes <= warnMinutes
      ? 'fast'
      : avgPrepMinutes <= lateMinutes
        ? 'warning'
        : 'slow';

  return {
    completedCount,
    avgPrepSeconds,
    avgPrepMinutes,
    formattedAvgPrepTime: formatPrepDuration(avgPrepSeconds),
    fastestMinutes: roundTo(minSec / 60, 1),
    slowestMinutes: roundTo(maxSec / 60, 1),
    withinTargetPct,
    activeCount,
    activeAvgWaitMinutes,
    slaHealth,
  };
}
