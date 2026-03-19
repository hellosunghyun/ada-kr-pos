import {
  DEFAULT_SESSION_CACHE_TTL_MS,
  getCachedApiKeyValidity,
  getCachedSessionResult,
  setCachedApiKeyValidity,
  setCachedSessionResult,
} from "./cache";
import type { AdakrposLogFn, AdakrposSession, AdakrposUser } from "./types";

const DEFAULT_AUTH_URL = "https://ada-kr-pos.com";
const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;
const DEFAULT_SESSION_NEGATIVE_CACHE_TTL_MS = 2_000;

export interface AdakrposAuthConfig {
  apiKey: string;
  authUrl?: string;
  logger?: AdakrposLogFn;
  sessionCacheTtlMs?: number;
  sessionNegativeCacheTtlMs?: number;
}

export interface AdakrposAuthClient {
  verifySession(sessionId: string): Promise<SessionVerificationResult | null>;
  getUser(userId: string): Promise<AdakrposUser | null>;
  getCurrentUser(sessionId: string): Promise<AdakrposUser | null>;
}

export type SessionVerificationResult = {
  user: AdakrposUser;
  session: AdakrposSession;
  edgeToken?: string;
};

function createUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).toString();
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function callLogger(
  logger: AdakrposLogFn | undefined,
  level: "info" | "warn" | "error" | "debug",
  message: string,
  meta?: Record<string, unknown>,
) {
  logger?.(level, message, meta);
}

function cloneSessionVerificationResult(
  result: SessionVerificationResult,
): SessionVerificationResult {
  return {
    user: {
      ...result.user,
      snsLinks: { ...result.user.snsLinks },
    },
    session: { ...result.session },
    ...(result.edgeToken ? { edgeToken: result.edgeToken } : {}),
  };
}

export function createAdakrposAuth(
  config: AdakrposAuthConfig,
): AdakrposAuthClient {
  const baseUrl = config.authUrl ?? DEFAULT_AUTH_URL;
  const apiKey = config.apiKey;
  const sessionCacheTtlMs =
    config.sessionCacheTtlMs ?? DEFAULT_SESSION_CACHE_TTL_MS;
  const sessionNegativeCacheTtlMs =
    config.sessionNegativeCacheTtlMs ?? DEFAULT_SESSION_NEGATIVE_CACHE_TTL_MS;
  const inFlightSessionRequests = new Map<
    string,
    Promise<SessionVerificationResult | null>
  >();

  async function request<T>(
    path: string,
    init: RequestInit,
    options: { returnNullOnNotFound?: boolean } = {},
  ): Promise<T | null> {
    const cachedValidity = getCachedApiKeyValidity(apiKey, config.logger);
    if (cachedValidity === false) {
      return null;
    }

    const url = createUrl(baseUrl, path);
    const method = init.method ?? "GET";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const startedAt = Date.now();

      callLogger(
        config.logger,
        "info",
        attempt === 1 ? "SDK API call" : "SDK API retry",
        { url, method, ...(attempt > 1 ? { attempt } : {}) },
      );

      let response: Response;

      try {
        response = await fetch(url, {
          ...init,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
          },
        });
      } catch (error) {
        if (attempt < MAX_ATTEMPTS) {
          callLogger(config.logger, "warn", "SDK API request error, retrying", {
            url,
            method,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        callLogger(config.logger, "error", "SDK API request error", {
          url,
          method,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      callLogger(config.logger, "info", "SDK API response", {
        url,
        status: response.status,
        duration: Date.now() - startedAt,
      });

      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        callLogger(config.logger, "warn", "SDK API server error, retrying", {
          url,
          status: response.status,
          attempt,
        });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      if (!response.ok) {
        callLogger(config.logger, "warn", "SDK API failed", {
          url,
          status: response.status,
        });
      }

      if (response.status === 401 || response.status === 403) {
        setCachedApiKeyValidity(apiKey, false, undefined, config.logger);
        return null;
      }

      setCachedApiKeyValidity(apiKey, true, undefined, config.logger);

      if (response.status === 404 && options.returnNullOnNotFound) {
        return null;
      }

      if (!response.ok) {
        throw new Error(
          `Adakrpos auth request failed with status ${response.status}`,
        );
      }

      return parseJson<T>(response);
    }

    throw new Error(
      `Adakrpos auth request failed after ${MAX_ATTEMPTS} attempts`,
    );
  }

  return {
    async verifySession(sessionId: string) {
      if (sessionCacheTtlMs > 0 || sessionNegativeCacheTtlMs > 0) {
        const cached = getCachedSessionResult<{
          user: AdakrposUser;
          session: AdakrposSession;
          edgeToken?: string;
        }>(apiKey, sessionId, config.logger);

        if (cached.hit) {
          if (!cached.value) {
            return null;
          }

          return cloneSessionVerificationResult(cached.value);
        }
      }

      const inFlight = inFlightSessionRequests.get(sessionId);
      if (inFlight) {
        return inFlight.then((result) =>
          result ? cloneSessionVerificationResult(result) : null,
        );
      }

      const verifyPromise = request<SessionVerificationResult>(
        "/api/sdk/verify-session",
        {
          method: "POST",
          body: JSON.stringify({ sessionId }),
        },
        { returnNullOnNotFound: true },
      ).then((result) => {
        if (result && sessionCacheTtlMs > 0) {
          setCachedSessionResult(
            apiKey,
            sessionId,
            result,
            sessionCacheTtlMs,
            config.logger,
          );
        } else if (
          !result &&
          sessionNegativeCacheTtlMs > 0 &&
          getCachedApiKeyValidity(apiKey, config.logger) !== false
        ) {
          setCachedSessionResult<SessionVerificationResult>(
            apiKey,
            sessionId,
            null,
            sessionNegativeCacheTtlMs,
            config.logger,
          );
        }

        return result;
      });

      inFlightSessionRequests.set(sessionId, verifyPromise);

      try {
        const result = await verifyPromise;
        return result ? cloneSessionVerificationResult(result) : null;
      } finally {
        inFlightSessionRequests.delete(sessionId);
      }
    },

    async getUser(userId: string) {
      return request<AdakrposUser>(
        `/api/sdk/users/${encodeURIComponent(userId)}`,
        {
          method: "GET",
        },
        { returnNullOnNotFound: true },
      );
    },

    async getCurrentUser(sessionId: string) {
      const result = await this.verifySession(sessionId);
      return result?.user ?? null;
    },
  };
}
