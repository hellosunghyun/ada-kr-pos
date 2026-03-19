import { getCachedApiKeyValidity, setCachedApiKeyValidity } from "./cache";
import type { AdakrposLogFn, AdakrposSession, AdakrposUser } from "./types";

const DEFAULT_AUTH_URL = "https://ada-kr-pos.com";
const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;

export interface AdakrposAuthConfig {
  apiKey: string;
  authUrl?: string;
  logger?: AdakrposLogFn;
}

export interface AdakrposAuthClient {
  verifySession(
    sessionId: string,
  ): Promise<{ user: AdakrposUser; session: AdakrposSession } | null>;
  getUser(userId: string): Promise<AdakrposUser | null>;
  getCurrentUser(sessionId: string): Promise<AdakrposUser | null>;
}

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

export function createAdakrposAuth(
  config: AdakrposAuthConfig,
): AdakrposAuthClient {
  const baseUrl = config.authUrl ?? DEFAULT_AUTH_URL;
  const apiKey = config.apiKey;

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
      return request<{ user: AdakrposUser; session: AdakrposSession }>(
        "/api/sdk/verify-session",
        {
          method: "POST",
          body: JSON.stringify({ sessionId }),
        },
        { returnNullOnNotFound: true },
      );
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
