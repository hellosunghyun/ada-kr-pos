import type { AdakrposLogFn } from "./types";

interface CacheEntry {
  valid: boolean;
  expiresAt: number;
}

function callLogger(
  logger: AdakrposLogFn | undefined,
  level: "info" | "warn" | "error" | "debug",
  message: string,
  meta?: Record<string, unknown>,
): void {
  logger?.(level, message, meta);
}

function maskApiKey(apiKey: string): string {
  return apiKey.slice(0, 11);
}

const cache = new Map<string, CacheEntry>();

export const DEFAULT_CACHE_TTL_MS = 30_000;

export function getCachedApiKeyValidity(
  apiKey: string,
  logger?: AdakrposLogFn,
): boolean | null {
  const entry = cache.get(apiKey);

  if (!entry) {
    callLogger(logger, "debug", "API key cache miss", {
      apiKey: maskApiKey(apiKey),
    });
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    cache.delete(apiKey);
    callLogger(logger, "debug", "API key cache miss", {
      apiKey: maskApiKey(apiKey),
    });
    return null;
  }

  callLogger(logger, "debug", "API key cache hit", {
    apiKey: maskApiKey(apiKey),
  });
  return entry.valid;
}

export function setCachedApiKeyValidity(
  apiKey: string,
  valid: boolean,
  ttlMs: number = DEFAULT_CACHE_TTL_MS,
  logger?: AdakrposLogFn,
): void {
  cache.set(apiKey, {
    valid,
    expiresAt: Date.now() + ttlMs,
  });

  callLogger(logger, "debug", "API key cache updated", {
    apiKey: maskApiKey(apiKey),
    valid,
    ttlMs,
  });
}

export function clearApiKeyCache(logger?: AdakrposLogFn): void {
  cache.clear();
  callLogger(logger, "info", "API key cache cleared");
}
