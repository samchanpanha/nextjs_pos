import type { PosAppState, PosOrder } from '../types/pos';

export type SyncHealthState = 'synced' | 'syncing' | 'offline_queued' | 'error' | 'conflict';

export interface SyncConflictInfo {
  clientVersion: number;
  serverVersion: number;
  serverOrdersCount?: number;
  detectedAt: string;
  message: string;
}

export interface PendingOfflineOrderSummary {
  id: string;
  orderNumber: number;
  tableName: string;
  status: PosOrder['status'];
  totalUsd: number;
  paymentMethod?: string;
  updatedAt: string;
}

export interface SyncStatusSummary {
  health: SyncHealthState;
  statusLabel: string;
  headline: string;
  detailMessage: string;
  needsAttention: boolean;
  isOffline: boolean;
  networkOnline: boolean;
  sseConnected: boolean;
  pendingCount: number;
  pendingTotalUsd: number;
  pendingOrders: PendingOfflineOrderSummary[];
  branchPendingCount: number;
}

const OFFLINE_CACHE_PREFIX = 'xaiwork_pos_offline_queue_v1:';

export function getPendingOfflineOrders(
  orders: PosOrder[],
  branchId?: string
): PendingOfflineOrderSummary[] {
  return orders
    .filter((o) => o.offlinePendingSync && (!branchId || o.branchId === branchId))
    .sort((a, b) => {
      const ta = new Date(b.updatedAt || b.createdAt).getTime() || 0;
      const tb = new Date(a.updatedAt || a.createdAt).getTime() || 0;
      return ta - tb;
    })
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      tableName: o.tableName,
      status: o.status,
      totalUsd: Math.round((o.totalUsd || 0) * 100) / 100,
      paymentMethod: o.paymentMethod,
      updatedAt: o.updatedAt || o.createdAt,
    }));
}

export function computeSyncStatusSummary(params: {
  cloudStatus: 'demo' | 'synced' | 'syncing' | 'error';
  offlineMode: boolean;
  networkOnline: boolean;
  sseConnected: boolean;
  orders: PosOrder[];
  branchId?: string;
  lastSyncedAt?: string | null;
  syncErrorMessage?: string | null;
  syncConflict?: SyncConflictInfo | null;
}): SyncStatusSummary {
  const {
    cloudStatus,
    offlineMode,
    networkOnline,
    sseConnected,
    orders,
    branchId,
    lastSyncedAt,
    syncErrorMessage,
    syncConflict,
  } = params;

  const allPending = getPendingOfflineOrders(orders);
  const branchPending = branchId ? getPendingOfflineOrders(orders, branchId) : allPending;
  const pendingCount = allPending.length;
  const pendingTotalUsd =
    Math.round(allPending.reduce((sum, item) => sum + item.totalUsd, 0) * 100) / 100;
  const isOffline = offlineMode || !networkOnline;

  if (syncConflict) {
    return {
      health: 'conflict',
      statusLabel: 'Sync Conflict',
      headline: `Version conflict with main server (Local v${syncConflict.clientVersion} vs Server v${syncConflict.serverVersion})`,
      detailMessage:
        syncConflict.message ||
        'Another terminal updated the main server while local changes were queued. Choose Keep Local & Push or Pull Server Version.',
      needsAttention: true,
      isOffline,
      networkOnline,
      sseConnected,
      pendingCount,
      pendingTotalUsd,
      pendingOrders: allPending,
      branchPendingCount: branchPending.length,
    };
  }

  if (cloudStatus === 'error' || Boolean(syncErrorMessage)) {
    const queueNote =
      pendingCount > 0
        ? ` ${pendingCount} offline ${pendingCount === 1 ? 'transaction' : 'transactions'} safely cached locally.`
        : '';
    return {
      health: 'error',
      statusLabel: pendingCount > 0 ? `Sync Error · ${pendingCount}` : 'Sync Error',
      headline: 'Unable to sync changes with the main SQLite server',
      detailMessage: `${syncErrorMessage || 'Connection interrupted or server returned an error.'}${queueNote}`,
      needsAttention: true,
      isOffline,
      networkOnline,
      sseConnected,
      pendingCount,
      pendingTotalUsd,
      pendingOrders: allPending,
      branchPendingCount: branchPending.length,
    };
  }

  if (isOffline || pendingCount > 0) {
    const reason = !networkOnline
      ? 'Device network offline'
      : offlineMode
        ? 'Offline queue mode active'
        : 'Queued transactions waiting to flush';
    return {
      health: 'offline_queued',
      statusLabel:
        pendingCount > 0
          ? `${isOffline ? 'Offline' : 'Queued'} · ${pendingCount}`
          : 'Offline Mode',
      headline:
        pendingCount > 0
          ? `${pendingCount} pending offline ${pendingCount === 1 ? 'transaction' : 'transactions'} ($${pendingTotalUsd.toFixed(2)})`
          : reason,
      detailMessage:
        pendingCount > 0
          ? !networkOnline
            ? 'Transactions are saved in local storage and will sync once network returns.'
            : offlineMode
              ? 'Switch back online or click Sync Now to push queued transactions to the main server.'
              : 'Network restored — click Sync Now to push queued transactions to the main server.'
          : 'Local cache active. New orders and payments will queue until back online.',
      needsAttention: pendingCount > 0 || !networkOnline,
      isOffline,
      networkOnline,
      sseConnected,
      pendingCount,
      pendingTotalUsd,
      pendingOrders: allPending,
      branchPendingCount: branchPending.length,
    };
  }

  if (cloudStatus === 'syncing') {
    return {
      health: 'syncing',
      statusLabel: 'Syncing...',
      headline: 'Syncing changes to main SQLite server',
      detailMessage: 'Persisting latest orders and table state.',
      needsAttention: false,
      isOffline: false,
      networkOnline,
      sseConnected,
      pendingCount: 0,
      pendingTotalUsd: 0,
      pendingOrders: [],
      branchPendingCount: 0,
    };
  }

  return {
    health: 'synced',
    statusLabel: sseConnected ? 'Synced · Live' : 'Synced',
    headline: 'All transactions synced with main server',
    detailMessage: lastSyncedAt
      ? `Last synced at ${new Date(lastSyncedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })}`
      : 'Connected to main SQLite server with zero pending transactions.',
    needsAttention: false,
    isOffline: false,
    networkOnline,
    sseConnected,
    pendingCount: 0,
    pendingTotalUsd: 0,
    pendingOrders: [],
    branchPendingCount: 0,
  };
}

export function saveOfflineTenantCache(
  tenantId: string,
  state: PosAppState,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null
): void {
  if (!storage || !tenantId) return;
  try {
    storage.setItem(
      `${OFFLINE_CACHE_PREFIX}${tenantId}`,
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        state,
      })
    );
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function loadOfflineTenantCache(
  tenantId: string,
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null
): { cachedAt: string; state: PosAppState } | null {
  if (!storage || !tenantId) return null;
  try {
    const raw = storage.getItem(`${OFFLINE_CACHE_PREFIX}${tenantId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cachedAt?: string; state?: PosAppState };
    if (!parsed?.state || parsed.state.tenantId !== tenantId) return null;
    return {
      cachedAt: parsed.cachedAt || new Date().toISOString(),
      state: parsed.state,
    };
  } catch {
    return null;
  }
}

export function clearOfflineTenantCache(
  tenantId: string,
  storage: Pick<Storage, 'removeItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null
): void {
  if (!storage || !tenantId) return;
  try {
    storage.removeItem(`${OFFLINE_CACHE_PREFIX}${tenantId}`);
  } catch {
    // Ignore storage errors
  }
}
