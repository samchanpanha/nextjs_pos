import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOfflineCacheBadge,
  summarizeCacheStats,
  type OfflineCacheSnapshot,
} from './offlineCache';

const BASE_SNAPSHOT: OfflineCacheSnapshot = {
  swState: 'idle',
  needRefresh: false,
  cacheStorageSupported: true,
  cachedEntriesCount: 0,
  cacheNames: [],
  lastUpdatedAt: null,
  errorMessage: null,
};

test('summarizeCacheStats totals cached entries across Workbox caches', () => {
  const result = summarizeCacheStats([
    { name: 'workbox-precache-v2', count: 14 },
    { name: 'pos-api-read-cache', count: 3 },
    { name: 'pos-media-cache', count: 6 },
  ]);
  assert.equal(result.cachedEntriesCount, 23);
  assert.deepEqual(result.cacheNames, [
    'workbox-precache-v2',
    'pos-api-read-cache',
    'pos-media-cache',
  ]);
});

test('formatOfflineCacheBadge displays cached entry count when offline-ready or active', () => {
  const ready = formatOfflineCacheBadge({
    ...BASE_SNAPSHOT,
    swState: 'offline-ready',
    cachedEntriesCount: 18,
  });
  assert.equal(ready.tone, 'emerald');
  assert.equal(ready.label, 'Offline Ready · 18 cached');

  const active = formatOfflineCacheBadge({
    ...BASE_SNAPSHOT,
    swState: 'active',
    cachedEntriesCount: 5,
  });
  assert.equal(active.tone, 'emerald');
  assert.equal(active.label, 'Offline Ready · 5 cached');
});

test('formatOfflineCacheBadge reflects update-available and error states cleanly', () => {
  const update = formatOfflineCacheBadge({
    ...BASE_SNAPSHOT,
    swState: 'update-available',
    needRefresh: true,
  });
  assert.equal(update.tone, 'sky');
  assert.equal(update.label, 'Update Ready');

  const err = formatOfflineCacheBadge({
    ...BASE_SNAPSHOT,
    swState: 'error',
    errorMessage: 'SW failed',
  });
  assert.equal(err.tone, 'amber');
  assert.equal(err.label, 'SW Error');
});
