import type {
  AiStockMonitorReport,
  AiStockMonitorRequestPayload,
} from './aiStockMonitor';
import { normalizeAiStockMonitorReport } from './aiStockMonitor';

/**
 * In-memory cache of AI Stock Monitor reports, keyed by the stock monitor
 * fingerprint. Shared by every panel that renders the monitor so a report
 * generated in one place (e.g. the AI Stock Monitor tab) is instantly reused
 * by the Auto-Restock draft generator without a second Gemini round-trip.
 */
export const stockMonitorMemoryCache = new Map<string, AiStockMonitorReport>();

export function getCachedStockMonitorReport(
  fingerprint: string
): AiStockMonitorReport | null {
  return stockMonitorMemoryCache.get(fingerprint) ?? null;
}

/**
 * Deterministic, offline fallback report built from the same sales-burn
 * signals the AI monitor uses. Used when Gemini is not configured or the
 * request fails, so Auto-Restock drafts still work without AI access.
 */
export function buildRuleBasedStockMonitorReport(
  payload: AiStockMonitorRequestPayload,
  generatedAt: string = new Date().toISOString()
): AiStockMonitorReport {
  return normalizeAiStockMonitorReport({}, {
    model: 'rule-based-fallback',
    generatedAt,
    payload,
  });
}

/**
 * Request a fresh AI Stock Monitor report from the server. Cache reads/writes
 * are the caller's responsibility so panels can share the cache map above.
 */
export async function requestStockMonitorReport(
  payload: AiStockMonitorRequestPayload,
  opts: { forceRefresh?: boolean; signal?: AbortSignal } = {}
): Promise<AiStockMonitorReport> {
  const res = await fetch('/api/ai/stock-monitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, forceRefresh: opts.forceRefresh }),
    signal: opts.signal,
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    report?: AiStockMonitorReport;
    error?: string;
  };

  if (!res.ok || !data.ok || !data.report) {
    throw new Error(data.error || `AI Stock Monitor request failed (${res.status}).`);
  }

  return data.report;
}
