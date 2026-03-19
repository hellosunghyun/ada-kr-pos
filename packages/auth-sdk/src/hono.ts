import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { createAdakrposAuth } from "./client";
import type { AdakrposAuthClient, AdakrposAuthConfig } from "./client";
import type {
  AdakrposAuthContext,
  AdakrposLogFn,
  AdakrposUnauthContext,
  AuthContext,
} from "./types";

type AuthFn = () => Promise<AuthContext>;

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthFn;
  }
}

const UNAUTH_CONTEXT: AdakrposUnauthContext = {
  user: null,
  session: null,
  isAuthenticated: false,
};

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

function createAuthFn(
  client: AdakrposAuthClient,
  sessionId: string | null,
  logger?: AdakrposLogFn,
): AuthFn {
  let authPromise: Promise<AuthContext> | undefined;

  return async () => {
    if (!authPromise) {
      authPromise = (async () => {
        if (!sessionId) {
          logger?.("info", "Auth resolved", { isAuthenticated: false });
          return UNAUTH_CONTEXT;
        }

        const result = await client.verifySession(sessionId);

        if (!result) {
          logger?.("info", "Auth resolved", { isAuthenticated: false });
          return UNAUTH_CONTEXT;
        }

        logger?.("info", "Auth resolved", { isAuthenticated: true });

        return {
          user: result.user,
          session: result.session,
          isAuthenticated: true,
          ...(result.edgeToken ? { edgeToken: result.edgeToken } : {}),
        } satisfies AdakrposAuthContext;
      })();
    }

    return authPromise;
  };
}

function setAuthContext(
  c: Context,
  client: AdakrposAuthClient,
  logger?: AdakrposLogFn,
): void {
  const cookieHeader = c.req.header("Cookie") ?? "";
  c.set(
    "auth",
    createAuthFn(client, getSessionId(cookieHeader, logger), logger),
  );
}

export function adakrposAuth(config: AdakrposAuthConfig) {
  const client = createAdakrposAuth(config);

  return createMiddleware(async (c, next) => {
    setAuthContext(c, client, config.logger);
    await next();
  });
}

export async function getAuth(c: Context): Promise<AuthContext> {
  const authFn = c.get("auth") as AuthFn | undefined;

  if (!authFn) {
    return UNAUTH_CONTEXT;
  }

  return authFn();
}

export function requireAuth(config: AdakrposAuthConfig) {
  const client = createAdakrposAuth(config);

  return createMiddleware(async (c, next) => {
    setAuthContext(c, client, config.logger);

    if (!(await getAuth(c)).isAuthenticated) {
      config.logger?.("warn", "Auth required: not authenticated");
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  });
}
