import {
  getCachedApiKeyValidity,
  setCachedApiKeyValidity,
} from "./cache";
import type { AdakrposSession, AdakrposUser } from "./types";

const DEFAULT_AUTH_URL = "https://ada-kr-pos.com";

export interface AdakrposAuthConfig {
  apiKey: string;
  authUrl?: string;
}

export interface AdakrposAuthClient {
  verifySession(
    sessionId: string,
  ): Promise<{ user: AdakrposUser; session: AdakrposSession } | null>;
  getUser(userId: string): Promise<AdakrposUser | null>;
  getCurrentUser(sessionId: string): Promise<AdakrposUser | null>;
}

function createUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function createAdakrposAuth(config: AdakrposAuthConfig): AdakrposAuthClient {
  const baseUrl = config.authUrl ?? DEFAULT_AUTH_URL;
  const apiKey = config.apiKey;

  async function request<T>(
    path: string,
    init: RequestInit,
    options: { returnNullOnNotFound?: boolean } = {},
  ): Promise<T | null> {
    if (getCachedApiKeyValidity(apiKey) === false) {
      return null;
    }

    const response = await fetch(createUrl(baseUrl, path), {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    if (response.status === 401 || response.status === 403) {
      setCachedApiKeyValidity(apiKey, false);
      return null;
    }

    setCachedApiKeyValidity(apiKey, true);

    if (response.status === 404 && options.returnNullOnNotFound) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Adakrpos auth request failed with status ${response.status}`);
    }

    return parseJson<T>(response);
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
      return request<AdakrposUser>(`/api/sdk/users/${encodeURIComponent(userId)}`, {
        method: "GET",
      }, { returnNullOnNotFound: true });
    },

    async getCurrentUser(sessionId: string) {
      const result = await this.verifySession(sessionId);
      return result?.user ?? null;
    },
  };
}
