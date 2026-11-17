import type { BranchConfig, DailyRevenuePoint, PosOrder } from '../types/pos';
import { roundCurrency, usdToKhr } from './posMath';

export interface AiForecastUpcomingDate {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. Mon, Tue
}

export interface AiForecastTopItem {
  name: string;
  qty: number;
  revenueUsd: number;
}

export interface AiForecastCategoryMetric {
  category: string;
  revenueUsd: number;
  sharePct: number;
}

export interface AiForecastRequestPayload {
  branchId: string;
  branchName: string;
  exchangeRate: number;
  rielRounding: number;
  referenceDate: string;
  prior7DayTotalUsd: number;
  prior7DayAvgUsd: number;
  todayCollectedUsd: number;
  todayPaidBills: number;
  avgBillUsd: number;
  historicalDays: DailyRevenuePoint[];
  upcomingDates: AiForecastUpcomingDate[];
  topItems: AiForecastTopItem[];
  categoryBreakdown: AiForecastCategoryMetric[];
}

export interface RawGeminiForecastDay {
  date?: string;
  dayLabel?: string;
  predictedRevenueUsd?: number;
  lowUsd?: number;
  highUsd?: number;
  confidencePct?: number;
  driverNote?: string;
}

export interface RawGeminiForecastPayload {
  summary?: string;
  trendDirection?: 'up' | 'flat' | 'down' | string;
  keyDrivers?: string[];
  recommendations?: string[];
  days?: RawGeminiForecastDay[];
}

export interface AiForecastDay {
  date: string;
  dayLabel: string;
  predictedRevenueUsd: number;
  predictedRevenueKhr: number;
  lowUsd: number;
  highUsd: number;
  confidencePct: number;
  driverNote: string;
}

export interface AiForecastReport {
  model: string;
  generatedAt: string;
  summary: string;
  trendDirection: 'up' | 'flat' | 'down';
  predictedTotalUsd: number;
  predictedTotalKhr: number;
  prior7DayTotalUsd: number;
  projectedChangePct: number;
  avgConfidencePct: number;
  peakDay: AiForecastDay | null;
  keyDrivers: string[];
  recommendations: string[];
  days: AiForecastDay[];
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function parseIsoDateUtc(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(Date.UTC(year, month, day));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function formatIsoDateUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWeekdayShort(isoDate: string): string {
  const d = parseIsoDateUtc(isoDate);
  return WEEKDAY_NAMES[d.getUTCDay()] ?? 'Day';
}

export function buildUpcomingForecastDates(
  referenceDateIso?: string,
  horizonDays = 7
): AiForecastUpcomingDate[] {
  const baseDate = referenceDateIso
    ? parseIsoDateUtc(referenceDateIso)
    : (() => {
        const now = new Date();
        return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      })();

  const count = Math.max(1, Math.min(14, Math.floor(horizonDays)));
  return Array.from({ length: count }, (_, idx) => {
    const target = new Date(baseDate.getTime() + (idx + 1) * 86400000);
    const iso = formatIsoDateUtc(target);
    return {
      date: iso,
      dayLabel: WEEKDAY_NAMES[target.getUTCDay()] ?? 'Day',
    };
  });
}

export interface BuildForecastHistoryInput {
  branch: Pick<BranchConfig, 'id' | 'name' | 'exchangeRate' | 'rielRounding'>;
  dailyRevenueHistory: DailyRevenuePoint[];
  orders: PosOrder[];
  referenceDateIso?: string;
}

export function buildForecastHistoryPayload(
  input: BuildForecastHistoryInput
): AiForecastRequestPayload {
  const { branch, dailyRevenueHistory, orders, referenceDateIso } = input;
  const paidOrders = orders.filter((o) => o.branchId === branch.id && o.status === 'paid');

  const todayCollectedUsd = roundCurrency(
    paidOrders.reduce((sum, o) => sum + (Number.isFinite(o.totalUsd) ? o.totalUsd : 0), 0)
  );
  const todayPaidBills = paidOrders.length;
  const avgBillUsd =
    todayPaidBills > 0 ? roundCurrency(todayCollectedUsd / todayPaidBills) : 0;

  const sortedHistory = [...dailyRevenueHistory]
    .filter((d) => Boolean(d.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayDate =
    referenceDateIso?.slice(0, 10) ||
    sortedHistory[sortedHistory.length - 1]?.date ||
    formatIsoDateUtc(new Date());

  // Merge today's live paid order revenue into the latest date point when live orders exceed or update today's baseline
  const mergedHistory = sortedHistory.map((point) => ({ ...point }));
  if (mergedHistory.length > 0) {
    const idx = mergedHistory.findIndex((p) => p.date === todayDate);
    if (idx >= 0 && todayPaidBills > 0) {
      mergedHistory[idx] = {
        ...mergedHistory[idx],
        netSalesUsd: roundCurrency(Math.max(mergedHistory[idx].netSalesUsd, todayCollectedUsd)),
        bills: Math.max(mergedHistory[idx].bills, todayPaidBills),
      };
    }
  } else if (todayPaidBills > 0) {
    mergedHistory.push({
      date: todayDate,
      netSalesUsd: todayCollectedUsd,
      bills: todayPaidBills,
      guests: paidOrders.reduce((sum, o) => sum + Math.max(1, o.guests || 1), 0),
    });
  }

  const last7 = mergedHistory.slice(-7);
  const prior7DayTotalUsd = roundCurrency(
    last7.reduce((sum, d) => sum + (Number.isFinite(d.netSalesUsd) ? d.netSalesUsd : 0), 0)
  );
  const prior7DayAvgUsd =
    last7.length > 0 ? roundCurrency(prior7DayTotalUsd / last7.length) : 0;

  // Top selling items across branch paid orders
  const itemMap = new Map<string, AiForecastTopItem>();
  const categoryMap = new Map<string, number>();

  for (const order of paidOrders) {
    for (const item of order.items) {
      if (item.voided || item.redeemedByLoyalty) continue;
      const lineRev = roundCurrency(item.unitPriceUsd * item.qty);
      const prevItem = itemMap.get(item.menuItemId) || {
        name: item.nameEn,
        qty: 0,
        revenueUsd: 0,
      };
      itemMap.set(item.menuItemId, {
        name: item.nameEn,
        qty: prevItem.qty + item.qty,
        revenueUsd: roundCurrency(prevItem.revenueUsd + lineRev),
      });

      const catKey = item.category || 'Uncategorized';
      categoryMap.set(catKey, roundCurrency((categoryMap.get(catKey) || 0) + lineRev));
    }
  }

  const topItems = Array.from(itemMap.values())
    .sort((a, b) => b.revenueUsd - a.revenueUsd)
    .slice(0, 6);

  const totalCatRev = Array.from(categoryMap.values()).reduce((s, v) => s + v, 0);
  const categoryBreakdown: AiForecastCategoryMetric[] = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, revenueUsd]) => ({
      category,
      revenueUsd,
      sharePct: totalCatRev > 0 ? Math.round((revenueUsd / totalCatRev) * 100) : 0,
    }));

  return {
    branchId: branch.id,
    branchName: branch.name,
    exchangeRate: branch.exchangeRate,
    rielRounding: branch.rielRounding,
    referenceDate: todayDate,
    prior7DayTotalUsd,
    prior7DayAvgUsd,
    todayCollectedUsd,
    todayPaidBills,
    avgBillUsd,
    historicalDays: mergedHistory.slice(-14),
    upcomingDates: buildUpcomingForecastDates(todayDate, 7),
    topItems,
    categoryBreakdown,
  };
}

export function buildForecastFingerprint(
  tenantId: string | undefined,
  payload: AiForecastRequestPayload
): string {
  const histKey = payload.historicalDays
    .map((d) => `${d.date}:${d.netSalesUsd.toFixed(2)}`)
    .join('|');
  return [
    tenantId || 'default',
    payload.branchId,
    payload.referenceDate,
    payload.todayPaidBills,
    payload.todayCollectedUsd.toFixed(2),
    histKey,
  ].join('::');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface NormalizeForecastOptions {
  model: string;
  generatedAt?: string;
  exchangeRate: number;
  rielRounding: number;
  prior7DayTotalUsd: number;
  upcomingDates: AiForecastUpcomingDate[];
}

export function normalizeAiForecastReport(
  raw: RawGeminiForecastPayload,
  options: NormalizeForecastOptions
): AiForecastReport {
  const rawDays = Array.isArray(raw.days) ? raw.days : [];
  const anchoredDates =
    options.upcomingDates.length === 7
      ? options.upcomingDates
      : buildUpcomingForecastDates(undefined, 7);

  const days: AiForecastDay[] = anchoredDates.map((slot, index) => {
    const matched =
      rawDays.find((d) => d.date === slot.date) || rawDays[index] || {};

    const rawPred = Number(matched.predictedRevenueUsd);
    const predictedRevenueUsd = roundCurrency(
      Number.isFinite(rawPred) && rawPred >= 0 ? rawPred : 0
    );

    const rawLow = Number(matched.lowUsd);
    const rawHigh = Number(matched.highUsd);

    const boundedLow = Number.isFinite(rawLow) && rawLow >= 0
      ? roundCurrency(Math.min(rawLow, predictedRevenueUsd))
      : roundCurrency(predictedRevenueUsd * 0.88);
    const boundedHigh = Number.isFinite(rawHigh) && rawHigh >= 0
      ? roundCurrency(Math.max(rawHigh, predictedRevenueUsd))
      : roundCurrency(predictedRevenueUsd * 1.12);

    const rawConf = Number(matched.confidencePct);
    const confidencePct = Math.round(
      clamp(Number.isFinite(rawConf) ? rawConf : 78, 10, 99)
    );

    const driverNote =
      typeof matched.driverNote === 'string' && matched.driverNote.trim()
        ? matched.driverNote.trim()
        : `${slot.dayLabel} projected demand`;

    return {
      date: slot.date,
      dayLabel:
        typeof matched.dayLabel === 'string' && matched.dayLabel.trim()
          ? matched.dayLabel.trim().slice(0, 12)
          : slot.dayLabel,
      predictedRevenueUsd,
      predictedRevenueKhr: usdToKhr(
        predictedRevenueUsd,
        options.exchangeRate,
        options.rielRounding
      ),
      lowUsd: boundedLow,
      highUsd: boundedHigh,
      confidencePct,
      driverNote,
    };
  });

  const predictedTotalUsd = roundCurrency(
    days.reduce((sum, d) => sum + d.predictedRevenueUsd, 0)
  );
  const predictedTotalKhr = usdToKhr(
    predictedTotalUsd,
    options.exchangeRate,
    options.rielRounding
  );

  const projectedChangePct =
    options.prior7DayTotalUsd > 0
      ? Math.round(
          ((predictedTotalUsd - options.prior7DayTotalUsd) /
            options.prior7DayTotalUsd) *
            1000
        ) / 10
      : 0;

  const avgConfidencePct =
    days.length > 0
      ? Math.round(days.reduce((sum, d) => sum + d.confidencePct, 0) / days.length)
      : 0;

  const peakDay =
    days.length > 0
      ? days.reduce((best, cur) =>
          cur.predictedRevenueUsd > best.predictedRevenueUsd ? cur : best
        )
      : null;

  const normalizedTrend: 'up' | 'flat' | 'down' =
    raw.trendDirection === 'up' ||
    raw.trendDirection === 'down' ||
    raw.trendDirection === 'flat'
      ? raw.trendDirection
      : projectedChangePct > 2
        ? 'up'
        : projectedChangePct < -2
          ? 'down'
          : 'flat';

  const keyDrivers = Array.isArray(raw.keyDrivers)
    ? raw.keyDrivers
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, 4)
    : [];

  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, 4)
    : [];

  return {
    model: options.model,
    generatedAt: options.generatedAt || new Date().toISOString(),
    summary:
      typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : `Projected 7-day revenue is $${predictedTotalUsd.toFixed(2)}.`,
    trendDirection: normalizedTrend,
    predictedTotalUsd,
    predictedTotalKhr,
    prior7DayTotalUsd: roundCurrency(options.prior7DayTotalUsd),
    projectedChangePct,
    avgConfidencePct,
    peakDay,
    keyDrivers,
    recommendations,
    days,
  };
}
