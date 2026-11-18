import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import {
  buildShiftOptimizationFingerprint,
  buildShiftOptimizationPayload,
  type AiShiftOptimizationReport,
} from '../utils/aiShiftOptimization';

const shiftOptMemoryCache = new Map<string, AiShiftOptimizationReport>();

export function AiShiftOptimizationPanel() {
  const { state, activeBranch } = usePos();

  const requestPayload = useMemo(
    () =>
      buildShiftOptimizationPayload({
        branch: activeBranch,
        dailyRevenueHistory: state.dailyRevenueHistory,
        orders: state.orders,
        shifts: state.shifts,
        staff: state.staff,
        reservations: state.reservations,
      }),
    [
      activeBranch,
      state.dailyRevenueHistory,
      state.orders,
      state.shifts,
      state.staff,
      state.reservations,
    ]
  );

  const fingerprint = useMemo(
    () => buildShiftOptimizationFingerprint(state.tenantId, requestPayload),
    [state.tenantId, requestPayload]
  );

  const [report, setReport] = useState<AiShiftOptimizationReport | null>(
    () => shiftOptMemoryCache.get(fingerprint) ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const payloadRef = useRef(requestPayload);
  payloadRef.current = requestPayload;

  const fetchOptimization = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = shiftOptMemoryCache.get(fingerprint);
        if (cached) {
          setReport(cached);
          setError(null);
          return;
        }
      }

      activeControllerRef.current?.abort();
      const controller = new AbortController();
      activeControllerRef.current = controller;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 35000);

      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/ai/shift-optimization', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payloadRef.current, forceRefresh }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          optimization?: AiShiftOptimizationReport;
          error?: string;
        };

        if (!res.ok || !data.ok || !data.optimization) {
          throw new Error(data.error || `Shift optimization request failed (${res.status}).`);
        }

        shiftOptMemoryCache.set(fingerprint, data.optimization);
        setReport(data.optimization);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          if (timedOut) {
            setError('Gemini shift optimization timed out. Please click Refresh AI Plan.');
          }
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Unable to generate AI staffing recommendations.'
        );
      } finally {
        window.clearTimeout(timeoutId);
        if (activeControllerRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [fingerprint]
  );

  useEffect(() => {
    void fetchOptimization(false);
    return () => {
      activeControllerRef.current?.abort();
    };
  }, [fetchOptimization]);

  const maxDaypartOrders = Math.max(
    1,
    ...requestPayload.daypartTraffic.map((d) => d.orderCount)
  );

  const trafficBadgeStyle = (level: 'high' | 'moderate' | 'low') => {
    if (level === 'high') {
      return 'border-amber-300 bg-amber-50 text-amber-900';
    }
    if (level === 'low') {
      return 'border-slate-200 bg-slate-100 text-slate-600';
    }
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  };

  return (
    <section
      aria-label="AI Shift Optimization"
      data-testid="ai-shift-optimization"
      className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#0A3D31] text-white">
              <Users className="h-4 w-4" />
            </span>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              AI Shift Optimization
            </h2>
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
              <Sparkles className="h-3 w-3 text-emerald-700" />
              Gemini Traffic &amp; Staffing
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Analyzes historical sales velocity, daypart traffic, and bookings for{' '}
            <strong className="text-slate-700">{activeBranch.name}</strong> to size upcoming shifts.
          </p>
        </div>

        <button
          type="button"
          data-testid="ai-shift-opt-refresh-btn"
          disabled={loading}
          onClick={() => void fetchOptimization(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Analyzing Traffic...' : 'Refresh AI Plan'}</span>
        </button>
      </div>

      {/* Observed Historical Traffic & Team Baseline */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3 text-emerald-700 shrink-0" />
            Observed Peak Window
          </div>
          <div className="mt-1 text-xs sm:text-sm font-bold text-slate-900">
            {report?.peakWindow || requestPayload.observedPeakWindow}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <BarChart3 className="h-3 w-3 text-emerald-700 shrink-0" />
            Avg Daily Volume
          </div>
          <div className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
            {requestPayload.avgDailyOrders} orders · ${requestPayload.avgDailyRevenueUsd.toFixed(0)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <Users className="h-3 w-3 text-emerald-700 shrink-0" />
            Active Branch Team
          </div>
          <div className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
            {requestPayload.currentBranchStaffCount} staff on roster
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
            {requestPayload.currentRoleCounts.cashiers} cashier ·{' '}
            {requestPayload.currentRoleCounts.kitchen} kitchen ·{' '}
            {requestPayload.currentRoleCounts.barOrFloor} floor
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-emerald-700 shrink-0" />
            Weekend &amp; Booking Load
          </div>
          <div className="mt-1 text-sm font-bold text-slate-900 tabular-nums">
            {requestPayload.weekendLiftPct >= 0 ? '+' : ''}
            {requestPayload.weekendLiftPct}% wknd · {requestPayload.upcomingReservationsCount} booked
          </div>
        </div>
      </div>

      {/* Historical Daypart Traffic Distribution */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>Historical Order Distribution by Shift Window</span>
          <span className="text-[11px] font-normal text-slate-500">
            {requestPayload.historicalDays.length} daily snapshots + live POS orders
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {requestPayload.daypartTraffic.map((dp) => {
            const pctWidth = Math.max(8, Math.round((dp.orderCount / maxDaypartOrders) * 100));
            return (
              <div key={dp.id} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="font-bold text-slate-800">{dp.label}</span>
                  <span className="text-slate-500 tabular-nums">{dp.shareOfOrdersPct}%</span>
                </div>
                <div className="text-[10px] text-slate-500">{dp.timeRange}</div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0B5D47]"
                    style={{ width: `${dp.orderCount > 0 ? pctWidth : 6}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] tabular-nums text-slate-700">
                  <span>{dp.orderCount} orders</span>
                  <span className="font-semibold">${dp.revenueUsd.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          data-testid="ai-shift-opt-error"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900 flex flex-wrap items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </span>
          <button
            type="button"
            onClick={() => void fetchOptimization(true)}
            className="rounded-md bg-red-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !report && (
        <div
          data-testid="ai-shift-opt-loading"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"
        >
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-36 rounded-xl border border-slate-200 bg-slate-50 animate-pulse p-3.5"
            />
          ))}
        </div>
      )}

      {/* Gemini Staffing Plan */}
      {report && (
        <div className="space-y-3" data-testid="ai-shift-opt-report">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium leading-relaxed">{report.summary}</p>
            <span className="text-[10px] font-semibold text-emerald-800 shrink-0">
              {report.model} · {new Date(report.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {report.shiftRecommendations.map((rec) => {
              const gap = rec.recommendedTotalStaff - requestPayload.currentBranchStaffCount;
              return (
                <div
                  key={`${rec.shiftName}-${rec.timeWindow}`}
                  data-testid="ai-shift-opt-card"
                  className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-900">{rec.shiftName}</div>
                        <div className="text-[11px] text-slate-500">
                          {rec.dayLabel} · {rec.timeWindow}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${trafficBadgeStyle(
                          rec.expectedTrafficLevel
                        )}`}
                      >
                        {rec.expectedTrafficLevel}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between border-y border-slate-100 py-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                          Ideal Staffing
                        </div>
                        <div className="text-lg font-extrabold text-[#0A3D31] tabular-nums">
                          {rec.recommendedTotalStaff}{' '}
                          <span className="text-xs font-semibold text-slate-600">staff</span>
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="text-[10px] text-slate-500">Est. Traffic</div>
                        <div className="text-xs font-bold text-slate-800">
                          {rec.expectedOrders} orders · ${rec.expectedRevenueUsd.toFixed(0)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[11px] tabular-nums">
                      <div className="rounded bg-slate-50 px-2 py-1 text-slate-700">
                        Cashier: <strong>{rec.roleBreakdown.cashiers}</strong>
                      </div>
                      <div className="rounded bg-slate-50 px-2 py-1 text-slate-700">
                        Kitchen: <strong>{rec.roleBreakdown.kitchen}</strong>
                      </div>
                      <div className="rounded bg-slate-50 px-2 py-1 text-slate-700">
                        Bar/Floor: <strong>{rec.roleBreakdown.barOrFloor}</strong>
                      </div>
                      <div className="rounded bg-slate-50 px-2 py-1 text-slate-700">
                        Supv: <strong>{rec.roleBreakdown.supervisor}</strong>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-snug">{rec.rationale}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        gap > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {gap > 0 ? (
                        <>
                          <AlertTriangle className="h-3 w-3 shrink-0" />+{gap} extra vs roster
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                          Covered by roster
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {report.optimizationActions.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Recommended Scheduling Actions
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-700">
                {report.optimizationActions.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-700 shrink-0" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
