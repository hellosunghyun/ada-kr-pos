import { importSPKI, jwtVerify } from "jose";
import { createAdakrposAuth } from "./client";
import type { AdakrposAuthConfig } from "./client";
import type {
  AdakrposAuthContext,
  AdakrposLogFn,
  AdakrposSession,
  AdakrposUnauthContext,
  AdakrposUser,
  AuthContext,
} from "./types";

const UNAUTH_CONTEXT: AdakrposUnauthContext = {
  user: null,
  session: null,
  isAuthenticated: false,
};

const EDGE_TOKEN_COOKIE_NAME = "adakrpos_edge";
const EDGE_TOKEN_ISSUER = "https://ada-kr-pos.com";
const EDGE_TOKEN_AUDIENCE = "adakrpos-edge";
const DEFAULT_LAYER1_CACHE_TTL_MS = 30_000;
const DEFAULT_LAYER1_MAX_ENTRIES = 200;
const DEFAULT_CLOCK_SKEW_SECONDS = 30;

interface EdgeTokenClaims {
  sid: string;
  user: AdakrposUser;
  session: AdakrposSession;
}

interface EdgeVerifyOptions {
  publicKey: string;
  cookieName?: string;
  issuer?: string;
  audience?: string;
  clockSkewSeconds?: number;
}

export interface VerifyRequestOptions {
  forceVerify?: boolean;
  edge?: EdgeVerifyOptions;
  layer1CacheTtlMs?: number;
  layer1MaxEntries?: number;
}

interface Layer1CacheEntry {
  authContext: AuthContext;
  expiresAt: number;
}

interface VerifiedEdgeToken {
  authContext: AdakrposAuthContext;
  tokenExpiresAtMs: number;
}

interface EdgeCookieOptions {
  domain?: string;
  maxAgeSeconds?: number;
  cookieName?: string;
}

const layer1Cache = new Map<string, Layer1CacheEntry>();
const pendingEdgeTokenByRequest = new WeakMap<Request, string>();
const publicKeyCache = new Map<string, Promise<CryptoKey>>();

function cloneAuthContext(authContext: AuthContext): AuthContext {
  if (!authContext.isAuthenticated) {
    return UNAUTH_CONTEXT;
  }

  return {
    user: {
      ...authContext.user,
      snsLinks: { ...authContext.user.snsLinks },
    },
    session: { ...authContext.session },
    isAuthenticated: true,
    ...(authContext.edgeToken ? { edgeToken: authContext.edgeToken } : {}),
  } satisfies AdakrposAuthContext;
}

function getCookieValue(
  cookieHeader: string,
  cookieName: string,
): string | null {
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`);
  const match = cookieHeader.match(pattern);

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function getLayer1CacheKey(
  sessionId: string,
  edgeToken: string | null,
): string {
  return `${sessionId}:${edgeToken ?? "no-edge-token"}`;
}

function pruneLayer1Cache(maxEntries: number): void {
  const now = Date.now();

  for (const [key, entry] of layer1Cache.entries()) {
    if (entry.expiresAt <= now) {
      layer1Cache.delete(key);
    }
  }

  while (layer1Cache.size > maxEntries) {
    const oldestKey = layer1Cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    layer1Cache.delete(oldestKey);
  }
}

function getLayer1Cache(
  key: string,
  logger?: AdakrposLogFn,
): AuthContext | null {
  const entry = layer1Cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    layer1Cache.delete(key);
    return null;
  }

  logger?.("debug", "Auth resolved from layer1 cache", { key });
  return cloneAuthContext(entry.authContext);
}

function setLayer1Cache(
  key: string,
  authContext: AuthContext,
  ttlMs: number,
  maxEntries: number,
): void {
  if (ttlMs <= 0) {
    return;
  }

  layer1Cache.set(key, {
    authContext: cloneAuthContext(authContext),
    expiresAt: Date.now() + ttlMs,
  });
  pruneLayer1Cache(maxEntries);
}

async function getPublicKey(publicKeyPem: string): Promise<CryptoKey> {
  const existing = publicKeyCache.get(publicKeyPem);

  if (existing) {
    return existing;
  }

  const imported = importSPKI(publicKeyPem, "ES256");
  publicKeyCache.set(publicKeyPem, imported);
  return imported;
}

async function verifyEdgeToken(
  edgeToken: string,
  sessionId: string,
  options: EdgeVerifyOptions,
  logger?: AdakrposLogFn,
): Promise<VerifiedEdgeToken | null> {
  try {
    const key = await getPublicKey(options.publicKey);
    const { payload } = await jwtVerify(edgeToken, key, {
      algorithms: ["ES256"],
      issuer: options.issuer ?? EDGE_TOKEN_ISSUER,
      audience: options.audience ?? EDGE_TOKEN_AUDIENCE,
      clockTolerance: options.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS,
    });

    const claims = payload as unknown as EdgeTokenClaims;

    if (claims.sid !== sessionId) {
      return null;
    }

    if (!claims.user || !claims.session || claims.session.id !== sessionId) {
      return null;
    }

    if (typeof payload.exp !== "number") {
      return null;
    }

    logger?.("debug", "Auth resolved from edge token", { sessionId });

    return {
      authContext: {
        user: claims.user,
        session: claims.session,
        isAuthenticated: true,
        edgeToken,
      } satisfies AdakrposAuthContext,
      tokenExpiresAtMs: payload.exp * 1000,
    };
  } catch (error) {
    logger?.("debug", "Edge token verification failed", { error });
    return null;
  }
}

function getEffectiveCacheTtlMs(
  desiredTtlMs: number,
  authContext: AdakrposAuthContext,
  options: { tokenExpiresAtMs?: number } = {},
): number {
  const now = Date.now();
  const bounds: number[] = [desiredTtlMs];

  const sessionRemaining = authContext.session.expiresAt - now;
  if (Number.isFinite(sessionRemaining)) {
    bounds.push(Math.max(0, sessionRemaining));
  }

  if (options.tokenExpiresAtMs) {
    const tokenRemaining = options.tokenExpiresAtMs - now;
    bounds.push(Math.max(0, tokenRemaining));
  }

  return Math.max(0, Math.min(...bounds));
}

export function getPendingEdgeToken(request: Request): string | null {
  return pendingEdgeTokenByRequest.get(request) ?? null;
}

export function consumePendingEdgeToken(request: Request): string | null {
  const token = pendingEdgeTokenByRequest.get(request) ?? null;

  if (token) {
    pendingEdgeTokenByRequest.delete(request);
  }

  return token;
}

export function buildEdgeTokenCookie(
  edgeToken: string,
  options: EdgeCookieOptions = {},
): string {
  const cookieName = options.cookieName ?? EDGE_TOKEN_COOKIE_NAME;
  const maxAge = options.maxAgeSeconds ?? 120;

  const attributes = [
    `${cookieName}=${encodeURIComponent(edgeToken)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];

  if (options.domain) {
    attributes.push(`Domain=${options.domain}`);
  }

  return attributes.join("; ");
}

function getSessionId(
  cookieHeader: string,
  logger?: AdakrposLogFn,
): string | null {
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)adakrpos_session=([^;]+)/);

  if (!sessionMatch) {
    return null;
  }

  try {
    return decodeURIComponent(sessionMatch[1]);
  } catch (error) {
    logger?.("debug", "Cookie decode failed", { error });
    return sessionMatch[1];
  }
}

// Framework-agnostic helper using Web standard Request
// Works with CF Workers, Deno, Bun, and any Web standard environment
export async function verifyRequest(
  request: Request,
  config: AdakrposAuthConfig,
  options: VerifyRequestOptions = {},
): Promise<AuthContext> {
  const client = createAdakrposAuth(config);

  const cookieHeader = request.headers.get("Cookie") ?? "";
  const sessionId = getSessionId(cookieHeader, config.logger);
  const edgeCookieName = options.edge?.cookieName ?? EDGE_TOKEN_COOKIE_NAME;
  const edgeToken = getCookieValue(cookieHeader, edgeCookieName);
  const cacheTtlMs = options.layer1CacheTtlMs ?? DEFAULT_LAYER1_CACHE_TTL_MS;
  const cacheMaxEntries =
    options.layer1MaxEntries ?? DEFAULT_LAYER1_MAX_ENTRIES;

  if (!sessionId) {
    pendingEdgeTokenByRequest.delete(request);
    config.logger?.("info", "Auth resolved", { isAuthenticated: false });
    return UNAUTH_CONTEXT;
  }

  const layer1CacheKey = getLayer1CacheKey(sessionId, edgeToken);

  if (!options.forceVerify) {
    const cachedAuth = getLayer1Cache(layer1CacheKey, config.logger);

    if (cachedAuth) {
      pendingEdgeTokenByRequest.delete(request);
      return cachedAuth;
    }

    if (edgeToken && options.edge?.publicKey) {
      const verifiedEdgeToken = await verifyEdgeToken(
        edgeToken,
        sessionId,
        options.edge,
        config.logger,
      );

      if (verifiedEdgeToken) {
        const effectiveTtlMs = getEffectiveCacheTtlMs(
          cacheTtlMs,
          verifiedEdgeToken.authContext,
          { tokenExpiresAtMs: verifiedEdgeToken.tokenExpiresAtMs },
        );

        setLayer1Cache(
          layer1CacheKey,
          verifiedEdgeToken.authContext,
          effectiveTtlMs,
          cacheMaxEntries,
        );
        pendingEdgeTokenByRequest.delete(request);
        return verifiedEdgeToken.authContext;
      }
    }
  }

  const result = await client.verifySession(sessionId);
  if (!result) {
    pendingEdgeTokenByRequest.delete(request);
    config.logger?.("info", "Auth resolved", { isAuthenticated: false });
    return UNAUTH_CONTEXT;
  }

  if (result.edgeToken) {
    pendingEdgeTokenByRequest.set(request, result.edgeToken);
  } else {
    pendingEdgeTokenByRequest.delete(request);
  }

  const authContext = {
    user: result.user,
    session: result.session,
    isAuthenticated: true,
    ...(result.edgeToken ? { edgeToken: result.edgeToken } : {}),
  } satisfies AdakrposAuthContext;

  const effectiveTtlMs = getEffectiveCacheTtlMs(cacheTtlMs, authContext);

  setLayer1Cache(layer1CacheKey, authContext, effectiveTtlMs, cacheMaxEntries);

  config.logger?.("info", "Auth resolved", { isAuthenticated: true });

  return authContext;
}
