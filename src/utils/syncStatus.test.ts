import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../data/seedData';
import {
  clearOfflineTenantCache,
  computeSyncStatusSummary,
  getPendingOfflineOrders,
  loadOfflineTenantCache,
  saveOfflineTenantCache,
} from './syncStatus';

test('getPendingOfflineOrders returns only offlinePendingSync orders sorted newest first', () => {
  const seed = createSeedState('restaurant');
  const orders = seed.orders.map((o, idx) => {
    if (idx === 0) {
      return {
        ...o,
        offlinePendingSync: true,
        updatedAt: '2026-11-17T08:00:00.000Z',
        totalUsd: 14.5,
      };
    }
    if (idx === 1) {
      return {
        ...o,
        offlinePendingSync: true,
        updatedAt: '2026-11-17T09:15:00.000Z',
        totalUsd: 22.25,
      };
    }
    return { ...o, offlinePendingSync: false };
  });

  const pending = getPendingOfflineOrders(orders);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].id, orders[1].id);
  assert.equal(pending[1].id, orders[0].id);
});

test('computeSyncStatusSummary prioritizes conflict over error and offline queue', () => {
  const seed = createSeedState('restaurant');
  const orders = seed.orders.map((o, idx) =>
    idx === 0 ? { ...o, offlinePendingSync: true, totalUsd: 18.75 } : o
  );

  const conflictSummary = computeSyncStatusSummary({
    cloudStatus: 'error',
    offlineMode: true,
    networkOnline: false,
    sseConnected: false,
    orders,
    syncErrorMessage: 'Network down',
    syncConflict: {
      clientVersion: 3,
      serverVersion: 5,
      serverOrdersCount: 12,
      detectedAt: '2026-11-17T10:00:00.000Z',
      message: 'Server has newer orders from another terminal.',
    },
  });

  assert.equal(conflictSummary.health, 'conflict');
  assert.equal(conflictSummary.statusLabel, 'Sync Conflict');
  assert.equal(conflictSummary.needsAttention, true);
  assert.equal(conflictSummary.pendingCount, 1);
  assert.equal(conflictSummary.pendingTotalUsd, 18.75);
  assert.match(conflictSummary.headline, /Local v3 vs Server v5/);
});

test('computeSyncStatusSummary surfaces sync errors while preserving pending queue counts', () => {
  const seed = createSeedState('restaurant');
  const orders = seed.orders.map((o, idx) =>
    idx === 0 ? { ...o, offlinePendingSync: true, totalUsd: 11.4 } : o
  );

  const errorSummary = computeSyncStatusSummary({
    cloudStatus: 'error',
    offlineMode: false,
    networkOnline: true,
    sseConnected: false,
    orders,
    syncErrorMessage: 'SQLite server returned 503',
  });

  assert.equal(errorSummary.health, 'error');
  assert.equal(errorSummary.statusLabel, 'Sync Error · 1');
  assert.equal(errorSummary.needsAttention, true);
  assert.match(errorSummary.detailMessage, /SQLite server returned 503/);
  assert.match(errorSummary.detailMessage, /1 offline transaction safely cached/);
});

test('computeSyncStatusSummary reports offline_queued when offline or pending bills exist', () => {
  const seed = createSeedState('restaurant');
  const orders = seed.orders.map((o, idx) =>
    idx < 2 ? { ...o, offlinePendingSync: true, totalUsd: 10 } : o
  );

  const offlineSummary = computeSyncStatusSummary({
    cloudStatus: 'synced',
    offlineMode: true,
    networkOnline: true,
    sseConnected: true,
    orders,
  });

  assert.equal(offlineSummary.health, 'offline_queued');
  assert.equal(offlineSummary.statusLabel, 'Offline · 2');
  assert.equal(offlineSummary.pendingCount, 2);
  assert.equal(offlineSummary.pendingTotalUsd, 20);
  assert.equal(offlineSummary.needsAttention, true);
});

test('computeSyncStatusSummary reports synced when online with zero pending items', () => {
  const seed = createSeedState('restaurant');
  const orders = seed.orders.map((o) => ({ ...o, offlinePendingSync: false }));

  const syncedSummary = computeSyncStatusSummary({
    cloudStatus: 'synced',
    offlineMode: false,
    networkOnline: true,
    sseConnected: true,
    orders,
    lastSyncedAt: '2026-11-17T10:30:00.000Z',
  });

  assert.equal(syncedSummary.health, 'synced');
  assert.equal(syncedSummary.statusLabel, 'Synced · Live');
  assert.equal(syncedSummary.needsAttention, false);
  assert.equal(syncedSummary.pendingCount, 0);
});

test('offline tenant cache round-trips and clears cleanly', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };

  const seed = createSeedState('restaurant');
  const tid = seed.tenantId || 'tenant_lotus_bkk1';
  saveOfflineTenantCache(tid, { ...seed, offlineMode: true }, mockStorage);

  const loaded = loadOfflineTenantCache(tid, mockStorage);
  assert.ok(loaded);
  assert.equal(loaded?.state.offlineMode, true);
  assert.equal(loaded?.state.tenantId, tid);

  clearOfflineTenantCache(tid, mockStorage);
  assert.equal(loadOfflineTenantCache(tid, mockStorage), null);
});
