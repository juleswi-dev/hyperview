interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

// Periodic eviction of expired entries to prevent memory leaks
// from unique cache keys (e.g., candle requests with different timestamps)
const EVICTION_INTERVAL = 60_000;
let evictionTimer: ReturnType<typeof setInterval> | null = null;

function startEviction() {
  if (evictionTimer) return;
  if (typeof setInterval === "undefined") return; // SSR guard
  evictionTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now > entry.expiresAt) cache.delete(key);
    }
    // Stop eviction when cache is empty to avoid idle timers
    if (cache.size === 0 && evictionTimer) {
      clearInterval(evictionTimer);
      evictionTimer = null;
    }
  }, EVICTION_INTERVAL);
}

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  startEviction();
}

/**
 * Fetch with caching and request deduplication.
 * Identical concurrent requests share a single in-flight promise.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  // Deduplicate concurrent requests
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher().then((data) => {
    setCache(key, data, ttlMs);
    inflight.delete(key);
    return data;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCache(key: string): void {
  cache.delete(key);
}

export function clearCache(): void {
  cache.clear();
  inflight.clear();
}
