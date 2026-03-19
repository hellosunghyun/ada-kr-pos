import type { AdakrposLogFn } from "./types";

interface CacheEntry {
  valid: boolean;
  expiresAt: number;
}

interface SessionCacheEntry<T> {
  value: T;
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

function maskSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

const cache = new Map<string, CacheEntry>();
const sessionCache = new Map<string, SessionCacheEntry<unknown>>();

export const DEFAULT_CACHE_TTL_MS = 30_000;
export const DEFAULT_SESSION_CACHE_TTL_MS = 5_000;

function getSessionCacheKey(apiKey: string, sessionId: string): string {
  return `${apiKey}:${sessionId}`;
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

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

export function getCachedSessionResult<T>(
  apiKey: string,
  sessionId: string,
  logger?: AdakrposLogFn,
): T | null {
  const key = getSessionCacheKey(apiKey, sessionId);
  const entry = sessionCache.get(key);

  if (!entry) {
    callLogger(logger, "debug", "Session cache miss", {
      sessionId: maskSessionId(sessionId),
    });
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    sessionCache.delete(key);
    callLogger(logger, "debug", "Session cache miss", {
      sessionId: maskSessionId(sessionId),
    });
    return null;
  }

  callLogger(logger, "debug", "Session cache hit", {
    sessionId: maskSessionId(sessionId),
  });

  return cloneValue(entry.value as T);
}

export function setCachedSessionResult<T>(
  apiKey: string,
  sessionId: string,
  value: T,
  ttlMs: number = DEFAULT_SESSION_CACHE_TTL_MS,
  logger?: AdakrposLogFn,
): void {
  const key = getSessionCacheKey(apiKey, sessionId);
  sessionCache.set(key, {
    value: cloneValue(value),
    expiresAt: Date.now() + ttlMs,
  });

  callLogger(logger, "debug", "Session cache updated", {
    sessionId: maskSessionId(sessionId),
    ttlMs,
  });
}

export function clearSessionCache(logger?: AdakrposLogFn): void {
  sessionCache.clear();
  callLogger(logger, "info", "Session cache cleared");
}
