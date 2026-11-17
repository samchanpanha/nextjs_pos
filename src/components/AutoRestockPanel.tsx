import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Mail,
  PackagePlus,
  Printer,
  RefreshCw,
  Send,
  Sparkles,
  Truck,
  X,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import {
  buildStockMonitorFingerprint,
  buildStockMonitorPayload,
  type AiStockMonitorReport,
} from '../utils/aiStockMonitor';
import {
  buildRuleBasedStockMonitorReport,
  getCachedStockMonitorReport,
  requestStockMonitorReport,
  stockMonitorMemoryCache,
} from '../utils/aiStockMonitorClient';
import {
  buildAutoRestockDraft,
  buildMailtoUrl,
  RESTOCK_PAYMENT_TERMS_LABELS,
  RESTOCK_URGENCY_LABELS,
  type AutoRestockSupplierDraft,
} from '../utils/autoRestock';
import type { Supplier } from '../types/pos';

interface AutoRestockPanelProps {
  onOpenMonitor?: () => void;
}

function urgencyBadgeClass(urgency: AutoRestockSupplierDraft['lines'][number]['urgency']): string {
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

export function AutoRestockPanel({ onOpenMonitor }: AutoRestockPanelProps) {
  const { state, activeBranch, notify, createPurchaseOrder } = usePos();

  const [includeWarnings, setIncludeWarnings] = useState(false);
  const [bufferDays, setBufferDays] = useState(7);
  const [report, setReport] = useState<AiStockMonitorReport | null>(null);
  const [reportSource, setReportSource] = useState<'ai' | 'rule-based' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [supplierOverrides, setSupplierOverrides] = useState<Record<string, string>>({});
  const [printTarget, setPrintTarget] = useState<AutoRestockSupplierDraft | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
        alertThresholdDays: 5,
      }),
    [
      activeBranch,
      state.ingredients,
      state.recipes,
      state.menuItems,
      state.orders,
      state.stockHistory,
      state.dailyRevenueHistory,
    ]
  );

  const fingerprint = useMemo(
    () => buildStockMonitorFingerprint(state.tenantId || 'default', requestPayload),
    [state.tenantId, requestPayload]
  );

  const payloadRef = useRef(requestPayload);
  payloadRef.current = requestPayload;
  const fingerprintRef = useRef(fingerprint);
  fingerprintRef.current = fingerprint;
  const activeControllerRef = useRef<AbortController | null>(null);

  const loadReport = useCallback(async (forceRefresh = false) => {
    const payload = payloadRef.current;
    const fp = fingerprintRef.current;

    if (payload.ingredients.length === 0) {
      setReport(null);
      setReportSource(null);
      setError('Track at least one ingredient in Stock before generating restock drafts.');
      return;
    }

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    if (!forceRefresh) {
      const cached = getCachedStockMonitorReport(fp);
      if (cached) {
        setReport(cached);
        setReportSource(cached.model === 'rule-based-fallback' ? 'rule-based' : 'ai');
        setError(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const nextReport = await requestStockMonitorReport(payload, {
        forceRefresh,
        signal: controller.signal,
      });
      stockMonitorMemoryCache.set(fp, nextReport);
      setReport(nextReport);
      setReportSource('ai');
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      // AI unavailable (e.g. Gemini key not configured) — fall back to the
      // deterministic burn forecast so restock drafts still work offline.
      const fallback = buildRuleBasedStockMonitorReport(payload);
      setReport(fallback);
      setReportSource('rule-based');
    } finally {
      if (activeControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadReport(false);
    return () => {
      activeControllerRef.current?.abort();
    };
  }, [fingerprint, loadReport]);

  const activeSuppliers = useMemo(
    () =>
      (state.suppliers || []).filter(
        (s) => s.active && (s.branchId === activeBranch.id || s.branchId === 'all')
      ),
    [state.suppliers, activeBranch.id]
  );

  const draft = useMemo(() => {
    if (!report) return null;
    return buildAutoRestockDraft({
      branch: activeBranch,
      ingredients: state.ingredients,
      suppliers: state.suppliers || [],
      report,
      existingPurchaseOrders: state.purchaseOrders || [],
      options: {
        includeWarnings,
        bufferDays,
        qtyOverrides,
        supplierOverrides,
        nextPoSeq: state.nextPoSeq || (state.purchaseOrders?.length || 0) + 1,
      },
    });
  }, [
    report,
    activeBranch,
    state.ingredients,
    state.suppliers,
    state.nextPoSeq,
    state.purchaseOrders,
    includeWarnings,
    bufferDays,
    qtyOverrides,
    supplierOverrides,
  ]);

  const criticalCount = useMemo(
    () =>
      draft
        ? draft.items.filter((i) => i.urgency === 'out' || i.urgency === 'critical').length
        : 0,
    [draft]
  );

  const warningCount = useMemo(
    () => (report ? report.items.filter((i) => i.urgency === 'warning').length : 0),
    [report]
  );

  const handleQtyChange = (ingredientId: string, raw: string) => {
    setQtyOverrides((prev) => {
      const next = { ...prev };
      const numeric = Number(raw);
      if (raw.trim() === '' || Number.isNaN(numeric)) {
        delete next[ingredientId];
      } else {
        next[ingredientId] = Math.max(0, Math.round(numeric));
      }
      return next;
    });
  };

  const handleSupplierChange = (ingredientId: string, supplierId: string) => {
    setSupplierOverrides((prev) => ({ ...prev, [ingredientId]: supplierId }));
  };

  const handleCopyEmail = async (po: AutoRestockSupplierDraft) => {
    try {
      await navigator.clipboard.writeText(po.email.body);
      setCopiedKey(po.poNumber);
      notify('Purchase order email body copied to clipboard.', 'success');
      window.setTimeout(() => setCopiedKey((current) => (current === po.poNumber ? null : current)), 2000);
    } catch {
      notify('Clipboard unavailable — please copy the email text manually.', 'error');
    }
  };

  const handleSaveDraftPo = (po: AutoRestockSupplierDraft) => {
    const created = createPurchaseOrder({
      supplierId: po.supplierId,
      orderDate: po.orderDate,
      expectedDate: po.expectedDate,
      paymentTerms: po.paymentTerms,
      applyInputVat: po.applyInputVat,
      status: 'draft',
      note: `Auto-Restock draft generated from ${po.poNumber} (AI Stock Monitor)`,
      lines: po.lines.map((line) => ({
        ingredientId: line.ingredientId,
        itemName: line.ingredientName,
        purchaseUnit: line.purchaseUnit,
        baseUnit: line.unit,
        conversionFactor: line.conversionFactor,
        orderedQty: line.orderPacks,
        unitCostUsd: line.unitCostUsd,
      })),
    });
    if (!created) {
      notify('Could not save the draft PO. Check the supplier and order lines.', 'error');
    }
  };

  const resetOverrides = () => {
    setQtyOverrides({});
    setSupplierOverrides({});
  };

  return (
    <div data-testid="auto-restock-panel" className="space-y-4">
      {/* Control header */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                <Truck className="h-3 w-3" /> Auto-Restock
              </span>
              {reportSource && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                    reportSource === 'ai'
                      ? 'bg-violet-50 border-violet-200 text-violet-800'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  {reportSource === 'ai'
                    ? `AI monitor · ${report?.model || ''}`
                    : 'Rule-based forecast (AI unavailable)'}
                </span>
              )}
            </div>
            <h2 className="mt-1.5 text-base font-bold text-slate-900">
              Supplier Purchase Order Drafts from Critical Stock
            </h2>
            <p className="text-xs text-slate-500">
              When an ingredient hits its critical threshold, Auto-Restock turns the AI Stock
              Monitor forecast into a ready-to-send supplier email or a printable PDF purchase
              order.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includeWarnings}
                onChange={(e) => setIncludeWarnings(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-700"
              />
              Include low-soon items
            </label>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <span>Safety buffer:</span>
              <select
                aria-label="Restock safety buffer days"
                value={bufferDays}
                onChange={(e) => setBufferDays(Number(e.target.value) || 7)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
              >
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days</option>
                <option value={10}>10 days</option>
                <option value={14}>14 days</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => void loadReport(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh Forecast'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
            {error}
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] text-slate-500">Critical / Out Items</div>
            <div
              className={`mt-1 text-xl font-bold tabular-nums ${
                criticalCount > 0 ? 'text-red-700' : 'text-emerald-800'
              }`}
            >
              {draft ? criticalCount : '—'}
            </div>
            <div className="text-[11px] text-slate-500">At or below minimum level</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] text-slate-500">Supplier Drafts</div>
            <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
              {draft ? draft.supplierDrafts.length : '—'}
            </div>
            <div className="text-[11px] text-slate-500">Grouped by supplier</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] text-slate-500">Est. Restock Budget</div>
            <div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">
              {draft ? `$${draft.totalEstimatedCostUsd.toFixed(2)}` : '—'}
            </div>
            <div className="text-[11px] text-slate-500">Including input VAT</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] text-slate-500">Low-Soon (optional)</div>
            <div className="mt-1 text-xl font-bold text-amber-700 tabular-nums">
              {report ? warningCount : '—'}
            </div>
            <div className="text-[11px] text-slate-500">
              {includeWarnings ? 'Included in drafts' : 'Toggle to include'}
            </div>
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && !draft && (
        <div className="space-y-3 py-4 animate-pulse" aria-busy="true">
          <div className="h-24 rounded-xl bg-slate-100" />
          <div className="h-40 rounded-xl bg-slate-100" />
        </div>
      )}

      {/* Empty states */}
      {!loading && draft && draft.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          </div>
          <p className="text-sm font-semibold text-slate-800">No critical stock right now</p>
          <p className="mx-auto max-w-md text-xs text-slate-500">
            Auto-Restock generates a supplier purchase order draft as soon as an ingredient drops
            to or below its minimum level.
            {warningCount > 0 && !includeWarnings
              ? ` ${warningCount} low-soon ingredient${warningCount === 1 ? '' : 's'} can be included now.`
              : ''}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {warningCount > 0 && !includeWarnings && (
              <button
                type="button"
                onClick={() => setIncludeWarnings(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
              >
                <PackagePlus className="h-3.5 w-3.5" />
                Include {warningCount} low-soon item{warningCount === 1 ? '' : 's'}
              </button>
            )}
            {onOpenMonitor && (
              <button
                type="button"
                onClick={onOpenMonitor}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Open AI Stock Monitor
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && draft && activeSuppliers.length === 0 && draft.items.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
          <span>
            <strong>No active suppliers found.</strong> Add suppliers under Purchase Orders →
            Suppliers so Auto-Restock can assign ingredients and pre-fill the order email.
          </span>
        </div>
      )}

      {draft && draft.skippedWithoutSupplier.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
          <span>
            Skipped {draft.skippedWithoutSupplier.length} ingredient
            {draft.skippedWithoutSupplier.length === 1 ? '' : 's'} without a matching supplier:{' '}
            {draft.skippedWithoutSupplier.join(', ')}.
          </span>
        </div>
      )}

      {draft && draft.skippedOnOpenPo.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" />
          <span>
            Already covered by an open purchase order — no duplicate draft:{' '}
            {draft.skippedOnOpenPo.join(', ')}.
          </span>
        </div>
      )}

      {/* Supplier drafts */}
      {draft &&
        draft.supplierDrafts.map((po) => (
          <div
            key={po.supplierId}
            className="rounded-xl border border-slate-200 bg-white overflow-hidden"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900">{po.supplierName}</h3>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-900">
                    {po.poNumber}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                      po.applyInputVat
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {po.applyInputVat ? 'VAT supplier' : 'Non-VAT supplier'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {po.supplierContactName} · {po.supplierPhone}
                  {po.supplierEmail ? ` · ${po.supplierEmail}` : ' · No email on file'} ·{' '}
                  {RESTOCK_PAYMENT_TERMS_LABELS[po.paymentTerms]}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Order date {po.orderDate} · Expected {po.expectedDate} · Due {po.dueDate}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={buildMailtoUrl(po.email)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
                >
                  <Send className="h-3.5 w-3.5" />
                  Email Draft
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyEmail(po)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedKey === po.poNumber ? 'Copied!' : 'Copy Email'}
                </button>
                <button
                  type="button"
                  onClick={() => setPrintTarget(po)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  PDF / Print
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveDraftPo(po)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Save as Draft PO
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 px-3 font-semibold">Ingredient</th>
                    <th className="py-2 px-2 font-semibold">Status</th>
                    <th className="py-2 px-2 font-semibold text-right">On Hand / Min</th>
                    <th className="py-2 px-2 font-semibold text-right">Est. Run-Out</th>
                    <th className="py-2 px-2 font-semibold text-right">Order Qty (packs)</th>
                    <th className="py-2 px-2 font-semibold text-right">Unit Cost</th>
                    <th className="py-2 px-2 font-semibold text-right">Total</th>
                    <th className="py-2 px-2 font-semibold">Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {po.lines.map((line) => {
                    const override = qtyOverrides[line.ingredientId];
                    return (
                      <tr key={line.ingredientId} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{line.ingredientName}</div>
                          <div className="text-[11px] text-slate-500">
                            {line.nameKh} · {line.purchaseUnit}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${urgencyBadgeClass(
                              line.urgency
                            )}`}
                          >
                            {RESTOCK_URGENCY_LABELS[line.urgency]}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">
                          {line.onHand.toLocaleString()} / {line.minLevel.toLocaleString()}{' '}
                          {line.unit}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">
                          {line.estimatedDaysRemaining !== null
                            ? `${line.estimatedDaysRemaining.toFixed(1)}d`
                            : '—'}
                          <div className="text-[10px] text-slate-400">
                            {line.predictedRunOutDate}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              aria-label={`Order packs for ${line.ingredientName}`}
                              value={override ?? line.orderPacks}
                              onChange={(e) => handleQtyChange(line.ingredientId, e.target.value)}
                              className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-right text-xs tabular-nums"
                            />
                            <span className="whitespace-nowrap text-slate-500">
                              × {line.purchaseUnit}
                            </span>
                          </div>
                          {override !== undefined && (
                            <div className="text-[10px] text-emerald-700">adjusted</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">
                          ${line.unitCostUsd.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-slate-900">
                          ${line.lineTotalUsd.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2">
                          <select
                            aria-label={`Supplier for ${line.ingredientName}`}
                            value={line.supplierId}
                            onChange={(e) =>
                              handleSupplierChange(line.ingredientId, e.target.value)
                            }
                            className="max-w-[11rem] rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700"
                          >
                            {activeSuppliers.map((sup: Supplier) => (
                              <option key={sup.id} value={sup.id}>
                                {sup.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {po.supplierEmail
                  ? `Ready to send to ${po.supplierEmail}`
                  : 'No supplier email — use PDF / Print instead'}
              </div>
              <div className="w-64 space-y-1 tabular-nums text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>${po.subtotalUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>10% Input VAT</span>
                  <span>${po.inputVatUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
                  <span>Total</span>
                  <span>${po.totalUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>≈ Khmer Riel</span>
                  <span>៛{po.totalKhr.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        ))}

      {draft && (Object.keys(qtyOverrides).length > 0 || Object.keys(supplierOverrides).length > 0) && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={resetOverrides}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <X className="h-3.5 w-3.5" />
            Reset quantity &amp; supplier adjustments
          </button>
        </div>
      )}

      {/* Printable purchase order draft */}
      {printTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="no-print flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <span className="text-sm font-bold text-slate-900">
                Purchase Order Draft · {printTarget.poNumber}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
                >
                  <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPrintTarget(null)}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                  aria-label="Close print preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto bg-white text-xs text-slate-900">
              <div className="flex justify-between items-start border-b-2 border-emerald-900 pb-4">
                <div>
                  <div className="text-lg font-bold text-slate-900">{activeBranch.name}</div>
                  <div className="text-slate-500">{activeBranch.address}</div>
                  {activeBranch.phone && <div className="text-slate-500">{activeBranch.phone}</div>}
                  <div className="font-mono text-[11px] text-slate-500">
                    VATTIN: {activeBranch.vattin}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold font-mono text-emerald-900">
                    {printTarget.poNumber}
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Purchase Order · Draft
                  </div>
                  <div className="text-slate-600">Order Date: {printTarget.orderDate}</div>
                  <div className="text-slate-600">Expected: {printTarget.expectedDate}</div>
                  <div className="text-slate-600">Due: {printTarget.dueDate}</div>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-3 flex flex-wrap justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Supplier</div>
                  <div className="font-bold text-slate-900">{printTarget.supplierName}</div>
                  <div className="text-slate-600">{printTarget.supplierContactName}</div>
                  <div className="text-slate-600">{printTarget.supplierPhone}</div>
                  {printTarget.supplierEmail && (
                    <div className="text-slate-600">{printTarget.supplierEmail}</div>
                  )}
                  <div className="font-mono text-[11px] text-slate-500">
                    {printTarget.supplierVattin || 'Non-VAT Supplier'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Payment Terms
                  </div>
                  <div className="font-bold text-slate-900">
                    {RESTOCK_PAYMENT_TERMS_LABELS[printTarget.paymentTerms]}
                  </div>
                  <div className="text-slate-600">
                    {printTarget.lines.length} item{printTarget.lines.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              <table className="mt-4 w-full text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 font-semibold">#</th>
                    <th className="py-2 font-semibold">Item</th>
                    <th className="py-2 text-right font-semibold">On Hand</th>
                    <th className="py-2 text-right font-semibold">Run-Out</th>
                    <th className="py-2 text-right font-semibold">Order Qty</th>
                    <th className="py-2 text-right font-semibold">Unit Cost</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {printTarget.lines.map((line, idx) => (
                    <tr key={line.ingredientId}>
                      <td className="py-2 text-slate-500">{idx + 1}</td>
                      <td className="py-2">
                        <div className="font-semibold text-slate-900">{line.ingredientName}</div>
                        <div className="text-[11px] text-slate-500">
                          {line.nameKh} · {RESTOCK_URGENCY_LABELS[line.urgency]}
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        {line.onHand.toLocaleString()} {line.unit}
                      </td>
                      <td className="py-2 text-right">
                        {line.estimatedDaysRemaining !== null
                          ? `${line.estimatedDaysRemaining.toFixed(1)}d`
                          : line.predictedRunOutDate}
                      </td>
                      <td className="py-2 text-right font-semibold">
                        {line.orderPacks} × {line.purchaseUnit}
                      </td>
                      <td className="py-2 text-right">${line.unitCostUsd.toFixed(2)}</td>
                      <td className="py-2 text-right font-semibold">
                        ${line.lineTotalUsd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 flex justify-end">
                <div className="w-64 space-y-1 tabular-nums">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>${printTarget.subtotalUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>10% Input VAT</span>
                    <span>${printTarget.inputVatUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
                    <span>Total</span>
                    <span>${printTarget.totalUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>≈ Khmer Riel</span>
                    <span>៛{printTarget.totalKhr.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed">
                Auto-generated by Auto-Restock from the AI Stock Monitor ({printTarget.lines.length}{' '}
                critical item{printTarget.lines.length === 1 ? '' : 's'}), {draft?.bufferDays || 7}-day
                safety buffer. Please confirm availability and expected delivery before payment.
              </div>

              <div className="mt-6 flex justify-between gap-6 text-[11px] text-slate-600">
                <div className="flex-1">
                  <div className="border-t border-slate-300 pt-1.5">Prepared by / Date</div>
                </div>
                <div className="flex-1 text-right">
                  <div className="border-t border-slate-300 pt-1.5">Received by / Date</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
