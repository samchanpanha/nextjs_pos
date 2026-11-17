import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Plus, RefreshCw, Sparkles } from 'lucide-react';
import type { BranchConfig, LanguageCode, MenuItem, PosOrder } from '../types/pos';
import {
  buildAiPairingsFingerprint,
  buildAiPairingsPayload,
  type AiPairingsReport,
  type SuggestedPairingItem,
} from '../utils/aiPairings';

const pairingsMemoryCache = new Map<string, AiPairingsReport>();

interface SuggestedPairingsCardProps {
  tenantId: string;
  branch: BranchConfig;
  activeOrder: PosOrder;
  menuItems: MenuItem[];
  orders: PosOrder[];
  language: LanguageCode;
  onAddPairing: (menuItem: MenuItem) => void;
}

export function SuggestedPairingsCard({
  tenantId,
  branch,
  activeOrder,
  menuItems,
  orders,
  language,
  onAddPairing,
}: SuggestedPairingsCardProps) {
  const payload = useMemo(
    () =>
      buildAiPairingsPayload({
        branch,
        menuItems,
        orders,
        activeOrder,
      }),
    [branch, menuItems, orders, activeOrder]
  );

  const fingerprint = useMemo(
    () => buildAiPairingsFingerprint(tenantId, payload),
    [tenantId, payload]
  );

  const [report, setReport] = useState<AiPairingsReport | null>(
    () => pairingsMemoryCache.get(fingerprint) ?? null
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const fetchPairings = useCallback(
    async (forceRefresh = false) => {
      const current = payloadRef.current;
      if (current.cartItems.length === 0 || current.candidates.length === 0) {
        setReport(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (!forceRefresh) {
        const cached = pairingsMemoryCache.get(fingerprint);
        if (cached) {
          setReport(cached);
          setError(null);
          setLoading(false);
          return;
        }
      }

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 25000);

      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/ai/pairings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...current, forceRefresh }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          report?: AiPairingsReport;
          error?: string;
        };

        if (!res.ok || !data.ok || !data.report) {
          throw new Error(data.error || `Suggested pairings request failed (${res.status}).`);
        }

        pairingsMemoryCache.set(fingerprint, data.report);
        setReport(data.report);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          if (timedOut) {
            setError('Suggested pairings timed out. Tap Retry.');
          }
          return;
        }
        setError(err instanceof Error ? err.message : 'Unable to load suggested pairings.');
      } finally {
        window.clearTimeout(timeoutId);
        if (controllerRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [fingerprint]
  );

  useEffect(() => {
    if (payload.cartItems.length === 0) {
      setReport(null);
      setError(null);
      return;
    }

    const cached = pairingsMemoryCache.get(fingerprint);
    if (cached) {
      setReport(cached);
      setError(null);
      setLoading(false);
      return;
    }

    setReport(null);
    setError(null);
    setLoading(true);

    const timerId = window.setTimeout(() => {
      void fetchPairings(false);
    }, 180);

    return () => {
      window.clearTimeout(timerId);
      controllerRef.current?.abort();
    };
  }, [fingerprint, payload.cartItems.length, fetchPairings]);

  if (payload.cartItems.length === 0) return null;

  const getLocalizedName = (pairing: SuggestedPairingItem) => {
    if (language === 'kh' && pairing.nameKh) return pairing.nameKh;
    if (language === 'vi' && pairing.nameVi) return pairing.nameVi;
    return pairing.nameEn;
  };

  const handleSelectPairing = (pairing: SuggestedPairingItem) => {
    const matchedMenu = menuItems.find(
      (m) => m.id === pairing.menuItemId && m.branchId === branch.id && m.active
    );
    if (!matchedMenu) return;
    onAddPairing(matchedMenu);
  };

  const visiblePairings = (report?.pairings || []).filter(
    (p) => !payload.cartItems.some((c) => c.menuItemId === p.menuItemId)
  );

  return (
    <section
      aria-label="Suggested Pairings"
      data-testid="ai-suggested-pairings"
      className="rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-amber-50/40 p-2.5 space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-800 text-white shrink-0">
            <Sparkles className="h-3 w-3" />
          </span>
          <span className="text-[11px] font-bold text-slate-900 truncate">
            Suggested Pairings
          </span>
          <span className="rounded bg-emerald-100 border border-emerald-200 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-900">
            AI
          </span>
          {payload.historicalOrdersAnalyzed > 0 && (
            <span className="text-[10px] text-slate-500 truncate">
              · {payload.historicalOrdersAnalyzed} orders
            </span>
          )}
        </div>

        <button
          type="button"
          aria-label="Refresh suggested pairings"
          disabled={loading}
          onClick={() => void fetchPairings(true)}
          title="Refresh AI pairings"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Analyzing' : 'Refresh'}</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-900 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="h-3.5 w-3.5 text-red-700 shrink-0" />
            <span className="truncate">{error}</span>
          </span>
          <button
            type="button"
            onClick={() => void fetchPairings(true)}
            className="shrink-0 rounded border border-red-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-red-800 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {loading && visiblePairings.length === 0 && !error && (
        <div className="space-y-1.5 animate-pulse" aria-busy="true">
          <div className="h-11 rounded-lg bg-white/80 border border-emerald-100" />
          <div className="h-11 rounded-lg bg-white/80 border border-emerald-100" />
        </div>
      )}

      {!loading && !error && report && visiblePairings.length === 0 && (
        <p className="text-[11px] text-slate-500">{report.summary}</p>
      )}

      {visiblePairings.length > 0 && (
        <div className="space-y-1.5">
          {visiblePairings.map((pairing) => (
            <div
              key={pairing.menuItemId}
              className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200/80 bg-white px-2.5 py-2 shadow-2xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-slate-900 truncate">
                    {getLocalizedName(pairing)}
                  </span>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 shrink-0">
                    {pairing.tag}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-snug line-clamp-1 mt-0.5">
                  {pairing.reason}
                </p>
              </div>

              <button
                type="button"
                aria-label={`Add suggested pairing ${pairing.nameEn}`}
                onClick={() => handleSelectPairing(pairing)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#0B5D47] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#094A38] shrink-0 tabular-nums"
              >
                <Plus className="h-3 w-3" />
                <span>${pairing.priceUsd.toFixed(2)}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
