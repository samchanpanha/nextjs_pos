import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CalendarClock,
  CheckCircle2,
  PackagePlus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import {
  buildStaffAlertsFromReport,
  buildStockMonitorFingerprint,
  buildStockMonitorPayload,
  type AiStockMonitorReport,
  type StockUrgencyTier,
} from '../utils/aiStockMonitor';

const stockMonitorMemoryCache = new Map<string, AiStockMonitorReport>();

function urgencyBadgeClass(urgency: StockUrgencyTier): string {
  switch (urgency) {
    case 'out':
      return 'bg-red-100 text-red-900 border-red-200';
    case 'critical':
      return 'bg-orange-100 text-orange-900 border-orange-200';
    case 'warning':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'healthy':
    default:
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
}

function urgencyLabel(urgency: StockUrgencyTier): string {
  switch (urgency) {
    case 'out':
      return 'Out of stock';
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Low soon';
    case 'healthy':
    default:
      return 'Healthy';
  }
}

interface AiStockMonitorPanelProps {
  onRestockIngredient?: (ingredientId: string, suggestedQty: number) => void;
}

export function AiStockMonitorPanel({ onRestockIngredient }: AiStockMonitorPanelProps) {
  const { state, activeBranch, aiStockAlerts, publishAiStockAlerts, dismissAiStockAlert, notify } =
    usePos();

  const [alertThresholdDays, setAlertThresholdDays] = useState<number>(5);

  const requestPayload = useMemo(
    () =>
      buildStockMonitorPayload({
        branch: activeBranch,
        ingredients: state.ingredients,
        recipes: state.recipes,
        menuItems: state.menuItems,
        orders: state.orders,
        stockHistory: state.stockHistory,
        dailyRevenueHistory: state.dailyRevenueHistory,
        alertThresholdDays,
      }),
    [
      activeBranch,
      state.ingredients,
      state.recipes,
      state.menuItems,
      state.orders,
      state.stockHistory,
      state.dailyRevenueHistory,
      alertThresholdDays,
    ]
  );

  const fingerprint = useMemo(
    () => buildStockMonitorFingerprint(state.tenantId || 'default', requestPayload),
    [state.tenantId, requestPayload]
  );

  const [report, setReport] = useState<AiStockMonitorReport | null>(
    () => stockMonitorMemoryCache.get(fingerprint) ?? null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastNotifiedCount, setLastNotifiedCount] = useState<number>(0);

  const activeControllerRef = useRef<AbortController | null>(null);
  const payloadRef = useRef(requestPayload);
  payloadRef.current = requestPayload;
  const branchIdRef = useRef(activeBranch.id);
  branchIdRef.current = activeBranch.id;

  const dispatchAlertsForReport = useCallback(
    (nextReport: AiStockMonitorReport, forceToast = false) => {
      const staffAlerts = buildStaffAlertsFromReport(branchIdRef.current, nextReport);
      const triggered = publishAiStockAlerts(branchIdRef.current, staffAlerts, {
        showToast: true,
        forceToast,
      });
      setLastNotifiedCount(staffAlerts.length);
      return { total: staffAlerts.length, triggered };
    },
    [publishAiStockAlerts]
  );

  const runAnalysis = useCallback(
    async (forceRefresh = false) => {
      if (payloadRef.current.ingredients.length === 0) {
        setReport(null);
        setError(null);
        return;
      }

      if (!forceRefresh) {
        const cached = stockMonitorMemoryCache.get(fingerprint);
        if (cached) {
          setReport(cached);
          setError(null);
          dispatchAlertsForReport(cached, false);
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
        const res = await fetch('/api/ai/stock-monitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payloadRef.current, forceRefresh }),
          signal: controller.signal,
        });

        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          report?: AiStockMonitorReport;
          error?: string;
        };

        if (!res.ok || !data.ok || !data.report) {
          throw new Error(data.error || `AI Stock Monitor request failed (${res.status}).`);
        }

        stockMonitorMemoryCache.set(fingerprint, data.report);
        setReport(data.report);
        dispatchAlertsForReport(data.report, false);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          if (timedOut) {
            setError(
              'Gemini AI Stock Monitor timed out under high demand. Please click Retry Analysis.'
            );
          }
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Unable to run AI Stock Monitor prediction.'
        );
      } finally {
        window.clearTimeout(timeoutId);
        if (activeControllerRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [fingerprint, dispatchAlertsForReport]
  );

  useEffect(() => {
    void runAnalysis(false);
    return () => {
      activeControllerRef.current?.abort();
    };
  }, [runAnalysis]);

  const branchActiveAlerts = useMemo(
    () => aiStockAlerts.filter((a) => a.branchId === activeBranch.id),
    [aiStockAlerts, activeBranch.id]
  );

  const totalSuggestedReorderCostUsd = useMemo(() => {
    if (!report) return 0;
    return report.items.reduce((sum, item) => sum + item.estimatedReorderCostUsd, 0);
  }, [report]);

  const handleBroadcastStaffAlerts = () => {
    if (!report) return;
    const staffAlerts = buildStaffAlertsFromReport(activeBranch.id, report);
    if (staffAlerts.length === 0) {
      notify('No ingredients require low-stock staff notification right now.', 'info');
      return;
    }
    publishAiStockAlerts(activeBranch.id, staffAlerts, { showToast: true, forceToast: true });
    setLastNotifiedCount(staffAlerts.length);
  };

  return (
    <div data-testid="ai-stock-monitor-panel" className="space-y-4">
      {/* Control Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                <Sparkles className="h-3 w-3" /> Gemini AI Stock Monitor
              </span>
              {report && (
                <span className="text-[11px] text-slate-500">
                  Model: {report.model} · Updated{' '}
                  {new Date(report.generatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
            <h2 className="mt-1.5 text-base font-bold text-slate-900">
              Predictive Run-Out Forecast &amp; Automated Staff Alerts
            </h2>
            <p className="text-xs text-slate-500">
              Analyzes 7-day ingredient burn, linked menu item sales, and waste logs to forecast
              stockouts and notify staff automatically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <span>Alert window:</span>
              <select
                aria-label="Stockout alert window"
                value={alertThresholdDays}
                onChange={(e) => setAlertThresholdDays(Number(e.target.value) || 5)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days</option>
                <option value={10}>10 days</option>
              </select>
            </label>

            <button
              type="button"
              onClick={handleBroadcastStaffAlerts}
              disabled={!report || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              <BellRing className="h-3.5 w-3.5" />
              Notify Staff ({report ? report.alertCount : 0})
            </button>

            <button
              type="button"
              onClick={() => void runAnalysis(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Analyzing...' : 'Analyze Stock'}
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-red-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void runAnalysis(true)}
              className="rounded-md border border-red-300 bg-white px-2.5 py-1 font-semibold text-red-800 hover:bg-red-100"
            >
              Retry Analysis
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !report && (
          <div className="space-y-3 py-4 animate-pulse" aria-busy="true">
            <div className="h-4 w-2/3 rounded bg-slate-200" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="h-16 rounded-lg bg-slate-100" />
              <div className="h-16 rounded-lg bg-slate-100" />
              <div className="h-16 rounded-lg bg-slate-100" />
              <div className="h-16 rounded-lg bg-slate-100" />
            </div>
            <div className="h-40 rounded-lg bg-slate-100" />
          </div>
        )}

        {report && (
          <>
            {/* Executive summary + actions */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
              <p className="text-xs text-slate-800 leading-relaxed font-medium">{report.summary}</p>
              {report.recommendedActions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {report.recommendedActions.map((action, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700"
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-700 shrink-0" />
                      {action}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* KPI Summary Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] text-slate-500">Critical / Out (&le;3d)</div>
                <div
                  className={`mt-1 text-xl font-bold tabular-nums ${
                    report.criticalCount > 0 ? 'text-red-700' : 'text-emerald-800'
                  }`}
                >
                  {report.criticalCount}
                </div>
                <div className="text-[11px] text-slate-500">Immediate reorder needed</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] text-slate-500">
                  Low Soon (&le;{report.alertThresholdDays}d)
                </div>
                <div
                  className={`mt-1 text-xl font-bold tabular-nums ${
                    report.warningCount > 0 ? 'text-amber-700' : 'text-emerald-800'
                  }`}
                >
                  {report.warningCount}
                </div>
                <div className="text-[11px] text-slate-500">Upcoming depletion warnings</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] text-slate-500">Staff Alerts Active</div>
                <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                  {branchActiveAlerts.length}
                </div>
                <div className="text-[11px] text-slate-500">
                  {lastNotifiedCount > 0
                    ? 'Synced to top Notification Bell'
                    : 'Auto-dispatched on threshold breach'}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] text-slate-500">Est. Reorder Budget</div>
                <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
                  ${totalSuggestedReorderCostUsd.toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500">For 7-day safety stock</div>
              </div>
            </div>

            {/* Prediction Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Ingredient</th>
                    <th className="py-2 pr-3 font-semibold text-right">On Hand</th>
                    <th className="py-2 pr-3 font-semibold text-right">Daily Burn</th>
                    <th className="py-2 pr-3 font-semibold text-right">Est. Run-Out</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 pr-3 font-semibold text-right">Suggested Order</th>
                    <th className="py-2 pr-3 font-semibold">AI Insight &amp; Staff Alert</th>
                    <th className="py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.items.map((item) => (
                    <tr
                      key={item.ingredientId}
                      className={
                        item.urgency === 'out' || item.urgency === 'critical'
                          ? 'bg-red-50/40'
                          : item.urgency === 'warning'
                            ? 'bg-amber-50/40'
                            : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-900">{item.ingredientName}</div>
                        <div className="text-[11px] text-slate-500">
                          {item.nameKh} · Min {item.minLevel.toLocaleString()} {item.unit}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-slate-900">
                        {item.onHand.toLocaleString()} {item.unit}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-700">
                        {item.dailyBurnRate > 0
                          ? `${item.dailyBurnRate.toLocaleString()} ${item.unit}/d`
                          : 'Minimal'}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        <div className="font-bold text-slate-900">
                          {item.estimatedDaysRemaining !== null
                            ? `${item.estimatedDaysRemaining.toFixed(1)}d`
                            : '—'}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center justify-end gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {item.predictedRunOutDate}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${urgencyBadgeClass(
                            item.urgency
                          )}`}
                        >
                          {urgencyLabel(item.urgency)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {item.suggestedReorderQty > 0 ? (
                          <div>
                            <div className="font-semibold text-slate-900">
                              +{item.suggestedReorderQty.toLocaleString()} {item.unit}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              ~${item.estimatedReorderCostUsd.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">Sufficient</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 max-w-xs">
                        <div className="text-slate-700 leading-snug">{item.rationale}</div>
                        {item.shouldNotifyStaff && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-800">
                            <Bell className="h-3 w-3 shrink-0" />
                            <span>{item.staffAlertMessage}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {onRestockIngredient && (
                          <button
                            type="button"
                            onClick={() =>
                              onRestockIngredient(
                                item.ingredientId,
                                item.suggestedReorderQty > 0 ? item.suggestedReorderQty : 500
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            <PackagePlus className="h-3 w-3" />
                            Restock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Dispatched Staff Low-Stock Notifications Panel */}
      {branchActiveAlerts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-amber-900 flex items-center gap-1.5">
              <BellRing className="h-3.5 w-3.5" />
              Active Automated Staff Low-Stock Notifications ({branchActiveAlerts.length})
            </h3>
            <span className="text-[11px] text-amber-800">
              Visible to staff in the top Notification Bell drawer
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {branchActiveAlerts.map((alert) => (
              <div
                key={alert.id}
                className="rounded-lg border border-amber-200 bg-white p-3 text-xs flex items-start justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-900">{alert.ingredientName}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${urgencyBadgeClass(
                        alert.urgency
                      )}`}
                    >
                      {alert.estimatedDaysRemaining !== null
                        ? `${alert.estimatedDaysRemaining}d left`
                        : urgencyLabel(alert.urgency)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">{alert.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dismissAiStockAlert(alert.id)}
                  className="shrink-0 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
