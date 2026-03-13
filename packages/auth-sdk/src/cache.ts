interface CacheEntry {
  valid: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export const DEFAULT_CACHE_TTL_MS = 30_000;

export function getCachedApiKeyValidity(apiKey: string): boolean | null {
  const entry = cache.get(apiKey);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(apiKey);
    return null;
  }

  return entry.valid;
}

export function setCachedApiKeyValidity(
  apiKey: string,
  valid: boolean,
  ttlMs: number = DEFAULT_CACHE_TTL_MS,
): void {
  cache.set(apiKey, {
    valid,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearApiKeyCache(): void {
  cache.clear();
}
