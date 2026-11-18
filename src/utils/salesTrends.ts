import type { PosOrder } from '../types/pos';
import { roundCurrency } from './posMath';

export interface DailyRevenueEntry {
  date: string;
  netSalesUsd: number;
  bills: number;
  guests: number;
}

export interface ThirtyDaySalesPoint {
  dateKey: string;
  label: string;
  netSalesUsd: number;
  bills: number;
  guests: number;
  avgTicketUsd: number;
  isToday: boolean;
  hasRecordedData: boolean;
}

export interface HourlyTrafficBucket {
  hour: number;
  hourLabel: string;
  ordersCount: number;
  revenueUsd: number;
  isPeak: boolean;
}

export interface ThirtyDaySalesReport {
  points: ThirtyDaySalesPoint[];
  total30dUsd: number;
  avgDailyUsd: number;
  total30dBills: number;
  recordedDaysCount: number;
  peakDay: {
    label: string;
    netSalesUsd: number;
    bills: number;
  };
  hourlyTraffic: HourlyTrafficBucket[];
  peakHourWindow: string;
  peakHourOrders: number;
}

function formatDayMonth(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function formatShortLabel(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function parseEntryDateKey(raw: string, referenceDate: Date): string | null {
  const clean = raw.trim();
  if (!clean) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }
  const slashMatch = clean.match(/^(\d{2})\/(\d{2})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    let year = referenceDate.getUTCFullYear();
    const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (candidate.getTime() - referenceDate.getTime() > 30 * 86_400_000) {
      year -= 1;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const dashMmDd = clean.match(/^(\d{2})-(\d{2})$/);
  if (dashMmDd) {
    const month = Number(dashMmDd[1]);
    const day = Number(dashMmDd[2]);
    let year = referenceDate.getUTCFullYear();
    const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (candidate.getTime() - referenceDate.getTime() > 30 * 86_400_000) {
      year -= 1;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

export function buildThirtyDaySalesSeries(input: {
  dailyRevenueHistory: DailyRevenueEntry[];
  orders: PosOrder[];
  branchId: string;
  referenceDateIso?: string;
}): ThirtyDaySalesReport {
  const refIso = (input.referenceDateIso || new Date().toISOString()).slice(0, 10);
  const refDate = new Date(`${refIso}T12:00:00Z`);

  const byIsoDate = new Map<string, DailyRevenueEntry>();
  for (const entry of input.dailyRevenueHistory) {
    const key = parseEntryDateKey(entry.date, refDate);
    if (!key) continue;
    const prev = byIsoDate.get(key);
    byIsoDate.set(key, {
      date: key,
      netSalesUsd: roundCurrency((prev?.netSalesUsd || 0) + (Number(entry.netSalesUsd) || 0)),
      bills: (prev?.bills || 0) + Math.max(0, Math.round(Number(entry.bills) || 0)),
      guests: (prev?.guests || 0) + Math.max(0, Math.round(Number(entry.guests) || 0)),
    });
  }

  // Merge live paid orders for today if today's live orders exceed or supplement history
  const branchOrders = input.orders.filter(
    (o) => o.branchId === input.branchId && o.status !== 'voided'
  );
  const todayPaidOrders = branchOrders.filter((o) => o.status === 'paid');
  const todayPaidUsd = roundCurrency(todayPaidOrders.reduce((s, o) => s + o.totalUsd, 0));
  const todayGuests = todayPaidOrders.reduce((s, o) => s + Math.max(1, o.guests || 1), 0);

  const existingToday = byIsoDate.get(refIso);
  if (todayPaidOrders.length > 0 && (!existingToday || todayPaidUsd > existingToday.netSalesUsd)) {
    byIsoDate.set(refIso, {
      date: refIso,
      netSalesUsd: Math.max(existingToday?.netSalesUsd || 0, todayPaidUsd),
      bills: Math.max(existingToday?.bills || 0, todayPaidOrders.length),
      guests: Math.max(existingToday?.guests || 0, todayGuests),
    });
  }

  const points: ThirtyDaySalesPoint[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const d = new Date(refDate.getTime() - offset * 86_400_000);
    const dateKey = d.toISOString().slice(0, 10);
    const matched = byIsoDate.get(dateKey);
    const netSalesUsd = roundCurrency(matched?.netSalesUsd || 0);
    const bills = matched?.bills || 0;
    const guests = matched?.guests || 0;
    const avgTicketUsd = bills > 0 ? roundCurrency(netSalesUsd / bills) : 0;

    points.push({
      dateKey,
      label: offset === 0 ? `Today (${formatDayMonth(d)})` : formatShortLabel(d),
      netSalesUsd,
      bills,
      guests,
      avgTicketUsd,
      isToday: offset === 0,
      hasRecordedData: Boolean(matched && (netSalesUsd > 0 || bills > 0)),
    });
  }

  const total30dUsd = roundCurrency(points.reduce((s, p) => s + p.netSalesUsd, 0));
  const total30dBills = points.reduce((s, p) => s + p.bills, 0);
  const recordedDaysCount = points.filter((p) => p.hasRecordedData).length;
  const avgDailyUsd =
    recordedDaysCount > 0 ? roundCurrency(total30dUsd / recordedDaysCount) : 0;

  let peakPoint = points[0];
  for (const p of points) {
    if (p.netSalesUsd > peakPoint.netSalesUsd) {
      peakPoint = p;
    }
  }

  // Hourly traffic bucket aggregation (07:00 to 22:00 operating window)
  const hourMap = new Map<number, { count: number; rev: number }>();
  for (let h = 7; h <= 22; h += 1) {
    hourMap.set(h, { count: 0, rev: 0 });
  }
  for (const order of branchOrders) {
    const dt = new Date(order.createdAt);
    if (Number.isNaN(dt.getTime())) continue;
    const h = Math.min(22, Math.max(7, dt.getHours()));
    const prev = hourMap.get(h) || { count: 0, rev: 0 };
    hourMap.set(h, {
      count: prev.count + 1,
      rev: roundCurrency(prev.rev + order.totalUsd),
    });
  }

  let maxHourOrders = 0;
  let peakHour = 12;
  hourMap.forEach((v, h) => {
    if (v.count > maxHourOrders) {
      maxHourOrders = v.count;
      peakHour = h;
    }
  });

  const hourlyTraffic: HourlyTrafficBucket[] = Array.from(hourMap.entries()).map(([hour, v]) => ({
    hour,
    hourLabel: `${String(hour).padStart(2, '0')}:00`,
    ordersCount: v.count,
    revenueUsd: v.rev,
    isPeak: maxHourOrders > 0 && v.count === maxHourOrders,
  }));

  const peakHourWindow =
    maxHourOrders > 0
      ? `${String(peakHour).padStart(2, '0')}:00 – ${String(Math.min(23, peakHour + 1)).padStart(2, '0')}:00`
      : '11:00 – 14:00';

  return {
    points,
    total30dUsd,
    avgDailyUsd,
    total30dBills,
    recordedDaysCount,
    peakDay: {
      label: peakPoint?.label || '—',
      netSalesUsd: peakPoint?.netSalesUsd || 0,
      bills: peakPoint?.bills || 0,
    },
    hourlyTraffic,
    peakHourWindow,
    peakHourOrders: maxHourOrders,
  };
}
