export type ServiceWorkerCacheState =
  | 'idle'
  | 'registering'
  | 'active'
  | 'offline-ready'
  | 'update-available'
  | 'unsupported'
  | 'error';

export interface OfflineCacheSnapshot {
  swState: ServiceWorkerCacheState;
  needRefresh: boolean;
  cacheStorageSupported: boolean;
  cachedEntriesCount: number;
  cacheNames: string[];
  lastUpdatedAt: string | null;
  errorMessage: string | null;
}

export function summarizeCacheStats(
  cacheEntryCounts: { name: string; count: number }[]
): { cachedEntriesCount: number; cacheNames: string[] } {
  const valid = cacheEntryCounts.filter((c) => c.count >= 0);
  const cachedEntriesCount = valid.reduce((sum, item) => sum + item.count, 0);
  const cacheNames = valid.map((item) => item.name);
  return { cachedEntriesCount, cacheNames };
}

export function formatOfflineCacheBadge(snapshot: OfflineCacheSnapshot): {
  label: string;
  tone: 'emerald' | 'amber' | 'sky' | 'slate';
} {
  if (snapshot.swState === 'update-available') {
    return { label: 'Update Ready', tone: 'sky' };
  }
  if (snapshot.swState === 'offline-ready' || (snapshot.swState === 'active' && snapshot.cachedEntriesCount > 0)) {
    return {
      label:
        snapshot.cachedEntriesCount > 0
          ? `Offline Ready · ${snapshot.cachedEntriesCount} cached`
          : 'Offline Ready',
      tone: 'emerald',
    };
  }
  if (snapshot.swState === 'active' || snapshot.swState === 'registering') {
    return {
      label: snapshot.swState === 'registering' ? 'Warming Cache...' : 'SW Active',
      tone: 'sky',
    };
  }
  if (snapshot.swState === 'error') {
    return { label: 'SW Error', tone: 'amber' };
  }
  return { label: 'Browser Cache Only', tone: 'slate' };
}

let currentSnapshot: OfflineCacheSnapshot = {
  swState: 'idle',
  needRefresh: false,
  cacheStorageSupported: typeof caches !== 'undefined',
  cachedEntriesCount: 0,
  cacheNames: [],
  lastUpdatedAt: null,
  errorMessage: null,
};

let updateSwCallback: ((reloadPage?: boolean) => Promise<void>) | null = null;
let registrationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function updateSnapshot(patch: Partial<OfflineCacheSnapshot>) {
  currentSnapshot = { ...currentSnapshot, ...patch };
  listeners.forEach((cb) => cb());
}

export function getOfflineCacheSnapshot(): OfflineCacheSnapshot {
  return currentSnapshot;
}

export function subscribeOfflineCacheStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshOfflineCacheStats(): Promise<OfflineCacheSnapshot> {
  if (typeof caches === 'undefined') {
    updateSnapshot({ cacheStorageSupported: false, cachedEntriesCount: 0, cacheNames: [] });
    return currentSnapshot;
  }

  try {
    const names = await caches.keys();
    const counts = await Promise.all(
      names.map(async (name) => {
        try {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          return { name, count: keys.length };
        } catch {
          return { name, count: 0 };
        }
      })
    );
    const { cachedEntriesCount, cacheNames } = summarizeCacheStats(counts);
    updateSnapshot({
      cacheStorageSupported: true,
      cachedEntriesCount,
      cacheNames,
      lastUpdatedAt: new Date().toISOString(),
    });
  } catch (err) {
    updateSnapshot({
      errorMessage: err instanceof Error ? err.message : 'Unable to inspect cache storage.',
    });
  }

  return currentSnapshot;
}

export async function triggerServiceWorkerUpdate(): Promise<void> {
  if (!updateSwCallback) return;
  await updateSwCallback(true);
}

export function registerPosServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    updateSnapshot({ swState: 'unsupported' });
    return Promise.resolve();
  }

  if (registrationPromise) return registrationPromise;

  updateSnapshot({ swState: 'registering', errorMessage: null });

  registrationPromise = (async () => {
    try {
      const { registerSW } = await import('virtual:pwa-register');
      updateSwCallback = registerSW({
        immediate: true,
        onOfflineReady() {
          updateSnapshot({
            swState: 'offline-ready',
            lastUpdatedAt: new Date().toISOString(),
          });
          void refreshOfflineCacheStats();
        },
        onNeedRefresh() {
          updateSnapshot({
            swState: 'update-available',
            needRefresh: true,
            lastUpdatedAt: new Date().toISOString(),
          });
        },
        onRegisteredSW(_swUrl, registration) {
          updateSnapshot({
            swState:
              currentSnapshot.swState === 'offline-ready' ? 'offline-ready' : 'active',
            lastUpdatedAt: new Date().toISOString(),
          });
          void refreshOfflineCacheStats();
          if (registration) {
            setInterval(() => {
              void registration.update().catch(() => {});
            }, 60 * 60 * 1000);
          }
        },
        onRegisterError(error) {
          updateSnapshot({
            swState: 'error',
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        },
      });
    } catch (err) {
      updateSnapshot({
        swState: 'error',
        errorMessage: err instanceof Error ? err.message : 'Service worker registration failed.',
      });
    }
  })();

  return registrationPromise;
}
