import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  Database,
  GitCompareArrows,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react';
import { usePos } from '../context/PosContext';
import { computeSyncStatusSummary } from '../utils/syncStatus';

export function useSellSyncStatus() {
  const {
    state,
    activeBranch,
    cloudStatus,
    sseConnected,
    networkOnline,
    lastSyncedAt,
    syncErrorMessage,
    syncConflict,
    toggleOfflineMode,
    retrySyncNow,
    resolveConflictUseServer,
  } = usePos();

  const summary = useMemo(
    () =>
      computeSyncStatusSummary({
        cloudStatus,
        offlineMode: state.offlineMode,
        networkOnline,
        sseConnected,
        orders: state.orders,
        branchId: activeBranch.id,
        lastSyncedAt,
        syncErrorMessage,
        syncConflict,
      }),
    [
      cloudStatus,
      state.offlineMode,
      networkOnline,
      sseConnected,
      state.orders,
      activeBranch.id,
      lastSyncedAt,
      syncErrorMessage,
      syncConflict,
    ]
  );

  return {
    summary,
    state,
    syncConflict,
    syncErrorMessage,
    lastSyncedAt,
    toggleOfflineMode,
    retrySyncNow,
    resolveConflictUseServer,
  };
}

export function SyncStatusToolbarControl() {
  const {
    summary,
    state,
    syncConflict,
    syncErrorMessage,
    lastSyncedAt,
    toggleOfflineMode,
    retrySyncNow,
    resolveConflictUseServer,
  } = useSellSyncStatus();

  const [open, setOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<'retry' | 'force' | 'pull' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const handleRetry = async () => {
    setBusyAction('retry');
    try {
      await retrySyncNow();
    } finally {
      setBusyAction(null);
    }
  };

  const handleForcePush = async () => {
    setBusyAction('force');
    try {
      await retrySyncNow({ forceOverwrite: true });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePullServer = async () => {
    setBusyAction('pull');
    try {
      await resolveConflictUseServer();
    } finally {
      setBusyAction(null);
    }
  };

  const buttonTheme =
    summary.health === 'conflict' || summary.health === 'error'
      ? 'border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100'
      : summary.health === 'offline_queued'
        ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
        : summary.health === 'syncing'
          ? 'border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100'
          : 'border-emerald-200 bg-white text-slate-800 hover:border-emerald-400 hover:bg-emerald-50/60';

  const statusIcon =
    summary.health === 'conflict' ? (
      <GitCompareArrows className="h-3.5 w-3.5 text-rose-700 shrink-0" />
    ) : summary.health === 'error' ? (
      <AlertTriangle className="h-3.5 w-3.5 text-rose-700 shrink-0" />
    ) : summary.health === 'offline_queued' ? (
      <WifiOff className="h-3.5 w-3.5 text-amber-700 shrink-0" />
    ) : summary.health === 'syncing' ? (
      <RefreshCw className="h-3.5 w-3.5 text-sky-700 animate-spin shrink-0" />
    ) : (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
    );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-testid="sell-sync-status-btn"
        aria-expanded={open}
        aria-label={`Sync status: ${summary.statusLabel}`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${buttonTheme}`}
      >
        {statusIcon}
        <span>{summary.statusLabel}</span>
        {summary.pendingCount > 0 && (
          <span
            data-testid="sell-sync-pending-badge"
            className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums ${
              summary.health === 'error' || summary.health === 'conflict'
                ? 'bg-rose-700 text-white'
                : 'bg-amber-700 text-white'
            }`}
          >
            {summary.pendingCount}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <section
          role="region"
          aria-label="Sync Status Details"
          data-testid="sell-sync-status-panel"
          className="fixed inset-x-3 top-24 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[380px] max-w-[calc(100vw-1.5rem)] z-40 rounded-xl border border-slate-200 bg-white shadow-xl p-3.5 space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                {statusIcon}
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Sync Status · {summary.statusLabel}
                </h3>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">{summary.headline}</p>
            </div>
            <button
              type="button"
              aria-label="Close sync status panel"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Connection & Version Diagnostics */}
          <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2 text-[11px]">
            <div>
              <span className="block text-[10px] text-slate-400">Main Server</span>
              <span
                className={`font-bold inline-flex items-center gap-1 ${
                  summary.health === 'conflict' || summary.health === 'error'
                    ? 'text-rose-800'
                    : !summary.networkOnline
                      ? 'text-amber-800'
                      : 'text-slate-800'
                }`}
              >
                <Database
                  className={`h-3 w-3 ${
                    summary.health === 'conflict' || summary.health === 'error'
                      ? 'text-rose-700'
                      : !summary.networkOnline
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                  }`}
                />
                {summary.health === 'conflict'
                  ? 'Conflict'
                  : summary.health === 'error'
                    ? 'Sync Error'
                    : summary.networkOnline
                      ? 'Reachable'
                      : 'No Network'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">Sync Version</span>
              <span className="font-bold text-slate-800 tabular-nums">
                v{state.version ?? 1}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400">Realtime SSE</span>
              <span
                className={`font-bold ${
                  summary.sseConnected ? 'text-emerald-800' : 'text-slate-600'
                }`}
              >
                {summary.sseConnected ? 'Live' : 'Standby'}
              </span>
            </div>
          </div>

          {/* Conflict Alert Box */}
          {syncConflict && (
            <div
              data-testid="sell-sync-conflict-box"
              className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 space-y-2 text-xs text-rose-950"
            >
              <div className="flex items-start gap-2">
                <GitCompareArrows className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">
                    Conflict Detected: Local v{syncConflict.clientVersion} vs Server v
                    {syncConflict.serverVersion}
                  </p>
                  <p className="text-[11px] text-rose-800 leading-snug">
                    {syncConflict.message}
                    {typeof syncConflict.serverOrdersCount === 'number'
                      ? ` Server currently holds ${syncConflict.serverOrdersCount} orders.`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleForcePush}
                  className="rounded-md bg-rose-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-800 disabled:opacity-60"
                >
                  {busyAction === 'force' ? 'Pushing...' : 'Keep Local & Push'}
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handlePullServer}
                  className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-900 hover:bg-rose-100 disabled:opacity-60"
                >
                  {busyAction === 'pull' ? 'Loading...' : 'Pull Server Version'}
                </button>
              </div>
            </div>
          )}

          {/* General Sync Error Box */}
          {!syncConflict && syncErrorMessage && (
            <div
              data-testid="sell-sync-error-box"
              className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 space-y-2 text-xs text-rose-950"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Main Server Sync Error</p>
                  <p className="text-[11px] text-rose-800 leading-snug">{syncErrorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleRetry}
                className="rounded-md bg-rose-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-800 disabled:opacity-60"
              >
                {busyAction === 'retry' ? 'Retrying...' : 'Retry Sync'}
              </button>
            </div>
          )}

          {/* Pending Offline Transactions List */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold uppercase tracking-wider text-slate-500">
                Pending Offline Queue
              </span>
              <span className="font-bold tabular-nums text-slate-800">
                {summary.pendingCount} {summary.pendingCount === 1 ? 'item' : 'items'} · $
                {summary.pendingTotalUsd.toFixed(2)}
              </span>
            </div>

            {summary.pendingOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">
                No pending offline transactions. All orders are persisted to SQLite.
              </div>
            ) : (
              <ul
                data-testid="sell-sync-pending-list"
                className="max-h-40 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200"
              >
                {summary.pendingOrders.map((ord) => (
                  <li
                    key={ord.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 tabular-nums">
                        #{ord.orderNumber}
                      </span>{' '}
                      <span className="text-slate-700 truncate">{ord.tableName}</span>
                      <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.2 text-[10px] font-semibold text-amber-900 capitalize">
                        {ord.status}
                      </span>
                    </div>
                    <span className="font-bold tabular-nums text-slate-900 shrink-0">
                      ${ord.totalUsd.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Controls & Last Sync Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px]">
            <span className="text-slate-500">
              {lastSyncedAt
                ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}`
                : 'Waiting for initial sync'}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="sell-sync-toggle-offline-btn"
                onClick={() => toggleOfflineMode()}
                className={`rounded-md border px-2 py-1 font-semibold transition-colors ${
                  state.offlineMode
                    ? 'border-emerald-700 bg-[#0B5D47] text-white hover:bg-[#094A38]'
                    : 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                }`}
              >
                {state.offlineMode ? 'Go Online & Sync' : 'Simulate Offline'}
              </button>

              {!state.offlineMode && (summary.pendingCount > 0 || summary.health === 'error') && !syncConflict && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleRetry}
                  className="rounded-md bg-slate-900 px-2.5 py-1 font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {busyAction === 'retry' ? 'Syncing...' : 'Sync Now'}
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export function SyncStatusAlertBanner() {
  const {
    summary,
    state,
    syncConflict,
    toggleOfflineMode,
    retrySyncNow,
    resolveConflictUseServer,
  } = useSellSyncStatus();

  const [busyAction, setBusyAction] = useState<'retry' | 'force' | 'pull' | null>(null);

  if (!summary.needsAttention) {
    return null;
  }

  const isConflict = summary.health === 'conflict' && syncConflict;
  const isError = summary.health === 'error';

  const containerStyle =
    isConflict || isError
      ? 'border-rose-300 bg-rose-50 text-rose-950'
      : 'border-amber-300 bg-amber-50 text-amber-950';

  const handleAction = async (kind: 'retry' | 'force' | 'pull') => {
    setBusyAction(kind);
    try {
      if (kind === 'retry') await retrySyncNow();
      else if (kind === 'force') await retrySyncNow({ forceOverwrite: true });
      else await resolveConflictUseServer();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      role="alert"
      data-testid="sell-sync-alert-banner"
      className={`flex flex-wrap items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-xs ${containerStyle}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        {isConflict ? (
          <GitCompareArrows className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
        ) : isError ? (
          <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
        ) : (
          <CloudOff className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <p className="font-bold leading-snug">{summary.headline}</p>
          <p className="text-[11px] opacity-90 leading-snug">{summary.detailMessage}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {isConflict ? (
          <>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => handleAction('force')}
              className="rounded-lg bg-rose-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-800 disabled:opacity-60"
            >
              {busyAction === 'force' ? 'Pushing...' : 'Keep Local & Push'}
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => handleAction('pull')}
              className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-900 hover:bg-rose-100 disabled:opacity-60"
            >
              {busyAction === 'pull' ? 'Loading...' : 'Pull Server Version'}
            </button>
          </>
        ) : isError ? (
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleAction('retry')}
            className="rounded-lg bg-rose-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-800 disabled:opacity-60"
          >
            {busyAction === 'retry' ? 'Retrying...' : 'Retry Sync'}
          </button>
        ) : state.offlineMode ? (
          <button
            type="button"
            onClick={() => toggleOfflineMode()}
            className="rounded-lg bg-amber-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-900"
          >
            Go Online & Sync ({summary.pendingCount})
          </button>
        ) : (
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleAction('retry')}
            className="rounded-lg bg-amber-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-900 disabled:opacity-60"
          >
            {busyAction === 'retry'
              ? 'Syncing...'
              : `Sync Now (${summary.pendingCount})`}
          </button>
        )}
      </div>
    </div>
  );
}
