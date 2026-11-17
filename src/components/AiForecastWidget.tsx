import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Minus,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import {
  buildForecastFingerprint,
  buildForecastHistoryPayload,
  type AiForecastReport,
} from '../utils/aiForecast';
import { usdToKhr } from '../utils/posMath';

const forecastMemoryCache = new Map<string, AiForecastReport>();

interface AiForecastWidgetProps {
  className?: string;
}

export function AiForecastWidget({ className = '' }: AiForecastWidgetProps) {
  const { state, activeBranch } = usePos();

  const requestPayload = useMemo(
    () =>
      buildForecastHistoryPayload({
        branch: activeBranch,
        dailyRevenueHistory: state.dailyRevenueHistory,
        orders: state.orders,
      }),
    [activeBranch, state.dailyRevenueHistory, state.orders]
  );

  const fingerprint = useMemo(
    () => buildForecastFingerprint(state.tenantId, requestPayload),
    [state.tenantId, requestPayload]
  );

  const [report, setReport] = useState<AiForecastReport | null>(
    () => forecastMemoryCache.get(fingerprint) ?? null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const payloadRef = useRef(requestPayload);
  payloadRef.current = requestPayload;

  const fetchForecast = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = forecastMemoryCache.get(fingerprint);
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
        const res = await fetch('/api/ai/forecast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payloadRef.current, forceRefresh }),
          signal: controller.signal,
        });

        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          forecast?: AiForecastReport;
          error?: string;
        };

        if (!res.ok || !data.ok || !data.forecast) {
          throw new Error(data.error || `Forecast request failed (${res.status}).`);
        }

        forecastMemoryCache.set(fingerprint, data.forecast);
        setReport(data.forecast);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          if (timedOut) {
            setError('Gemini forecast request timed out under high demand. Please click Retry Forecast.');
          }
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Unable to generate AI revenue forecast.'
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
    void fetchForecast(false);
    return () => {
      activeControllerRef.current?.abort();
    };
  }, [fetchForecast]);

  const maxChartUsd = useMemo(() => {
    if (!report || report.days.length === 0) return 100;
    const peakVal = Math.max(
      ...report.days.map((d) => Math.max(d.highUsd, d.predictedRevenueUsd))
    );
    return Math.max(10, Math.ceil(peakVal * 1.15));
  }, [report]);

  const trendBadge = useMemo(() => {
    if (!report) return null;
    if (report.projectedChangePct > 0.5 || report.trendDirection === 'up') {
      return {
        color: 'text-emerald-800 bg-emerald-50 border-emerald-200',
        Icon: ArrowUpRight,
        label: `${report.projectedChangePct >= 0 ? '+' : ''}${report.projectedChangePct.toFixed(1)}% vs prior 7d`,
      };
    }
    if (report.projectedChangePct < -0.5 || report.trendDirection === 'down') {
      return {
        color: 'text-amber-800 bg-amber-50 border-amber-200',
        Icon: ArrowDownRight,
        label: `${report.projectedChangePct.toFixed(1)}% vs prior 7d`,
      };
    }
    return {
      color: 'text-slate-700 bg-slate-100 border-slate-200',
      Icon: Minus,
      label: `${report.projectedChangePct >= 0 ? '+' : ''}${report.projectedChangePct.toFixed(1)}% steady`,
    };
  }, [report]);

  return (
    <section
      aria-label="AI 7-Day Revenue Forecast"
      data-testid="ai-forecast-widget"
      className={`rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-800 shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">AI Forecast</h2>
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                Gemini · 7-day prediction
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Analyzes {requestPayload.historicalDays.length} historical days &amp; live{' '}
              {activeBranch.name} sales ({requestPayload.todayPaidBills} bills today)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {report?.generatedAt && (
            <span className="text-[11px] text-slate-400 tabular-nums hidden sm:inline">
              Updated {new Date(report.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => void fetchForecast(true)}
            disabled={loading}
            aria-label="Refresh AI Forecast"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-700' : ''}`} />
            {loading ? 'Analyzing...' : 'Refresh Forecast'}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-red-900"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void fetchForecast(true)}
            disabled={loading}
            className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
          >
            Retry Forecast
          </button>
        </div>
      )}

      {/* Initial Loading Skeleton */}
      {loading && !report && (
        <div className="space-y-4 py-2" aria-busy="true">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-800">
            <TrendingUp className="h-4 w-4 animate-pulse" />
            <span>Analyzing historical revenue trends with Gemini...</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-20 rounded-lg border border-slate-100 bg-slate-50 animate-pulse"
              />
            ))}
          </div>
          <div className="h-52 rounded-lg border border-slate-100 bg-slate-50 animate-pulse" />
        </div>
      )}

      {/* Loaded Gemini Forecast */}
      {report && (
        <div className={`space-y-4 transition-opacity ${loading ? 'opacity-65' : 'opacity-100'}`}>
          {/* 4-Metric Forecast Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="text-[11px] font-medium text-slate-500">Projected 7-day revenue</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                ${report.predictedTotalUsd.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                {report.predictedTotalKhr.toLocaleString()} ៛
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="text-[11px] font-medium text-slate-500">Trend vs prior 7 days</div>
              <div className="mt-1.5">
                {trendBadge && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold tabular-nums ${trendBadge.color}`}
                  >
                    <trendBadge.Icon className="h-3.5 w-3.5" />
                    {trendBadge.label}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums mt-1.5">
                Prior 7d actual: ${report.prior7DayTotalUsd.toFixed(2)}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="text-[11px] font-medium text-slate-500">Projected peak day</div>
              <div className="mt-1 text-xl font-bold text-emerald-800 tabular-nums">
                {report.peakDay ? `$${report.peakDay.predictedRevenueUsd.toFixed(2)}` : '—'}
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                <span>
                  {report.peakDay
                    ? `${report.peakDay.dayLabel} · ${report.peakDay.date.slice(5)}`
                    : 'N/A'}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="text-[11px] font-medium text-slate-500">Forecast confidence</div>
              <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                {report.avgConfidencePct}%
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Avg daily model confidence
              </div>
            </div>
          </div>

          {/* Chart + Day-by-Day Table */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* SVG Forecast Chart with Confidence Whiskers */}
            <div className="lg:col-span-7 rounded-lg border border-slate-200 p-3.5 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-slate-800">
                  7-day daily prediction &amp; range (USD)
                </span>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600 inline-block" />
                    Predicted
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-0.5 bg-slate-400 inline-block" />
                    Low–High band
                  </span>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox="0 0 640 215"
                  className="w-full h-56"
                  role="img"
                  aria-label="7-day AI revenue forecast bar chart"
                >
                  {[0.25, 0.5, 0.75, 1].map((frac) => {
                    const y = Math.round(172 - frac * 136);
                    const gridVal = Math.round(maxChartUsd * frac);
                    return (
                      <g key={frac}>
                        <line
                          x1={42}
                          y1={y}
                          x2={628}
                          y2={y}
                          stroke="#F1F5F9"
                          strokeWidth={1}
                        />
                        <text
                          x={36}
                          y={y + 3}
                          textAnchor="end"
                          fontSize="10"
                          fill="#94A3B8"
                        >
                          ${gridVal}
                        </text>
                      </g>
                    );
                  })}

                  <line x1={42} y1={172} x2={628} y2={172} stroke="#E2E8F0" strokeWidth={1} />

                  {report.days.map((day, idx) => {
                    const slotW = (628 - 48) / 7;
                    const barW = 44;
                    const centerX = 48 + idx * slotW + slotW / 2;
                    const barX = centerX - barW / 2;
                    const barH = Math.max(
                      6,
                      Math.round((day.predictedRevenueUsd / maxChartUsd) * 136)
                    );
                    const barY = 172 - barH;
                    const lowY = Math.min(
                      172,
                      Math.round(172 - (day.lowUsd / maxChartUsd) * 136)
                    );
                    const highY = Math.max(
                      24,
                      Math.round(172 - (day.highUsd / maxChartUsd) * 136)
                    );
                    const isPeak = report.peakDay?.date === day.date;

                    return (
                      <g key={day.date}>
                        <rect
                          x={barX}
                          y={barY}
                          width={barW}
                          height={barH}
                          rx={6}
                          fill={isPeak ? '#065F46' : '#10B981'}
                          fillOpacity={isPeak ? 1 : 0.85}
                        />
                        {/* Confidence interval stem */}
                        <line
                          x1={centerX}
                          y1={highY}
                          x2={centerX}
                          y2={lowY}
                          stroke="#475569"
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                        />
                        <line
                          x1={centerX - 6}
                          y1={highY}
                          x2={centerX + 6}
                          y2={highY}
                          stroke="#475569"
                          strokeWidth={1.5}
                        />
                        <line
                          x1={centerX - 6}
                          y1={lowY}
                          x2={centerX + 6}
                          y2={lowY}
                          stroke="#475569"
                          strokeWidth={1.5}
                        />

                        <text
                          x={centerX}
                          y={Math.max(15, Math.min(barY, highY) - 6)}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="700"
                          fill="#0F172A"
                        >
                          ${Math.round(day.predictedRevenueUsd)}
                        </text>
                        <text
                          x={centerX}
                          y={190}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="600"
                          fill="#334155"
                        >
                          {day.dayLabel}
                        </text>
                        <text
                          x={centerX}
                          y={204}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#64748B"
                        >
                          {day.date.slice(5)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Day-by-Day Breakdown */}
            <div className="lg:col-span-5 rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
              {report.days.map((day) => {
                const isPeak = report.peakDay?.date === day.date;
                const khr = usdToKhr(
                  day.predictedRevenueUsd,
                  activeBranch.exchangeRate,
                  activeBranch.rielRounding
                );
                return (
                  <div
                    key={day.date}
                    className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                      isPeak ? 'bg-emerald-50/50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900">
                          {day.dayLabel} {day.date.slice(5)}
                        </span>
                        {isPeak && (
                          <span className="rounded bg-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Peak
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {day.confidencePct}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{day.driverNote}</p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="font-bold text-slate-900">
                        ${day.predictedRevenueUsd.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {khr.toLocaleString()} ៛ · ${Math.round(day.lowUsd)}–${Math.round(day.highUsd)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Executive Summary, Drivers & Recommendations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 pt-1">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="text-xs font-bold text-slate-900 mb-1.5">Gemini Outlook</div>
              <p className="text-xs leading-relaxed text-slate-700">{report.summary}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="text-xs font-bold text-slate-900 mb-1.5">Key Demand Drivers</div>
              <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                {report.keyDrivers.length > 0 ? (
                  report.keyDrivers.map((item, idx) => <li key={idx}>{item}</li>)
                ) : (
                  <li>Weekday-to-weekend revenue cadence</li>
                )}
              </ul>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5">
              <div className="text-xs font-bold text-emerald-950 mb-1.5">
                Recommended Actions
              </div>
              <ul className="space-y-1 text-xs text-emerald-900 list-disc pl-4">
                {report.recommendations.length > 0 ? (
                  report.recommendations.map((item, idx) => <li key={idx}>{item}</li>)
                ) : (
                  <li>Align prep and staffing ahead of peak projected days</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
