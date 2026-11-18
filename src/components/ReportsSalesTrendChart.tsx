import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock, TrendingUp } from 'lucide-react';
import { usePos } from '../context/PosContext';
import { buildThirtyDaySalesSeries } from '../utils/salesTrends';

type TrendMetric = 'netSalesUsd' | 'bills' | 'avgTicketUsd';

const METRIC_META: Record<TrendMetric, { label: string; color: string; prefix: string }> = {
  netSalesUsd: { label: 'Revenue ($)', color: '#065F46', prefix: '$' },
  bills: { label: 'Paid Orders', color: '#0F766E', prefix: '' },
  avgTicketUsd: { label: 'Avg Ticket ($)', color: '#B45309', prefix: '$' },
};

export function ReportsSalesTrendChart() {
  const { state, activeBranch } = usePos();
  const [metric, setMetric] = useState<TrendMetric>('netSalesUsd');

  const report = useMemo(
    () =>
      buildThirtyDaySalesSeries({
        dailyRevenueHistory: state.dailyRevenueHistory,
        orders: state.orders,
        branchId: activeBranch.id,
      }),
    [state.dailyRevenueHistory, state.orders, activeBranch.id]
  );

  const meta = METRIC_META[metric];
  const avgReferenceValue =
    metric === 'netSalesUsd'
      ? report.avgDailyUsd
      : metric === 'bills' && report.recordedDaysCount > 0
        ? Math.round(report.total30dBills / report.recordedDaysCount)
        : metric === 'avgTicketUsd' && report.total30dBills > 0
          ? Number((report.total30dUsd / report.total30dBills).toFixed(2))
          : 0;

  return (
    <div
      data-testid="reports-30d-chart"
      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
    >
      {/* Header & Metric Toggle */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-800" />
            30-Day Daily Sales Trends &amp; Peak Business Hours
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeBranch.name} · {report.recordedDaysCount} active trading days · Daily average $
            {report.avgDailyUsd.toFixed(2)}
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
          {(Object.keys(METRIC_META) as TrendMetric[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className={`rounded-md px-2.5 py-1 font-semibold whitespace-nowrap transition-colors ${
                metric === key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {METRIC_META[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* Key 30-Day & Peak Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <div className="text-slate-500">30-Day Revenue</div>
          <div className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
            ${report.total30dUsd.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            {report.total30dBills} total bills
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <div className="text-slate-500">Daily Average</div>
          <div className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
            ${report.avgDailyUsd.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500">Across recorded days</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <div className="text-slate-500">Peak Day (30d)</div>
          <div className="mt-0.5 text-base font-bold text-emerald-800 tabular-nums">
            ${report.peakDay.netSalesUsd.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 tabular-nums">
            {report.peakDay.label} · {report.peakDay.bills} bills
          </div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
          <div className="text-emerald-900 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Peak Business Hour
          </div>
          <div className="mt-0.5 text-base font-bold text-emerald-950 tabular-nums">
            {report.peakHourWindow}
          </div>
          <div className="text-[11px] text-emerald-800 tabular-nums">
            {report.peakHourOrders > 0
              ? `${report.peakHourOrders} live orders in rush hour`
              : 'Based on service schedule'}
          </div>
        </div>
      </div>

      {/* Main Recharts 30-Day LineChart */}
      <div className="h-64 w-full" data-testid="recharts-30d-line-container">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={report.points} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#64748B' }}
              tickLine={false}
              axisLine={{ stroke: '#CBD5E1' }}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748B' }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(val: number) => `${meta.prefix}${val}`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '12px',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              }}
              formatter={(value) => {
                const num = Number(value ?? 0) || 0;
                return [
                  metric === 'bills' ? `${num} bills` : `$${num.toFixed(2)}`,
                  meta.label,
                ];
              }}
              labelFormatter={(label, payload) => {
                const row = payload?.[0]?.payload as { bills?: number; guests?: number } | undefined;
                if (!row) return String(label);
                return `${label} · ${row.bills ?? 0} bills · ${row.guests ?? 0} guests`;
              }}
            />
            {avgReferenceValue > 0 && (
              <ReferenceLine
                y={avgReferenceValue}
                stroke="#94A3B8"
                strokeDasharray="4 4"
                label={{
                  value: `Avg ${meta.prefix}${avgReferenceValue}`,
                  position: 'insideTopRight',
                  fill: '#64748B',
                  fontSize: 10,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey={metric}
              stroke={meta.color}
              strokeWidth={2.5}
              isAnimationActive={false}
              dot={{ r: 2.5, fill: meta.color, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: meta.color, stroke: '#FFFFFF', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Peak Business Hours Breakdown via Recharts */}
      <div className="border-t border-slate-100 pt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-slate-800">
            Hourly Order Velocity (07:00 – 22:00)
          </span>
          <span className="text-slate-500">
            Highlighted bars show peak staffing hours ({report.peakHourWindow})
          </span>
        </div>
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={report.hourlyTraffic}
              margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
            >
              <XAxis
                dataKey="hourLabel"
                tick={{ fontSize: 10, fill: '#64748B' }}
                tickLine={false}
                axisLine={false}
                interval={2}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  fontSize: '11px',
                }}
                formatter={(val, _name, item) => {
                  const rev = (item?.payload as { revenueUsd?: number } | undefined)?.revenueUsd ?? 0;
                  return [`${Number(val ?? 0)} orders ($${rev.toFixed(2)})`, 'Traffic'];
                }}
              />
              <Bar dataKey="ordersCount" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {report.hourlyTraffic.map((entry) => (
                  <Cell
                    key={entry.hour}
                    fill={entry.isPeak ? '#065F46' : entry.ordersCount > 0 ? '#10B981' : '#E2E8F0'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
