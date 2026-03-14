import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { createAdakrposAuth } from "./client";
import type { AdakrposAuthClient, AdakrposAuthConfig } from "./client";
import type { AdakrposAuthContext, AuthContext, AdakrposUnauthContext } from "./types";

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

function getSessionId(cookieHeader: string): string | null {
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)adakrpos_session=([^;]+)/);

  if (!sessionMatch) {
    return null;
  }

  try {
    return decodeURIComponent(sessionMatch[1]);
  } catch {
    return sessionMatch[1];
  }
}

function createAuthFn(client: AdakrposAuthClient, sessionId: string | null): AuthFn {
  let authPromise: Promise<AuthContext> | undefined;

  return async () => {
    if (!authPromise) {
      authPromise = (async () => {
        if (!sessionId) {
          return UNAUTH_CONTEXT;
        }

        const result = await client.verifySession(sessionId);

        if (!result) {
          return UNAUTH_CONTEXT;
        }

        return {
          user: result.user,
          session: result.session,
          isAuthenticated: true,
        } satisfies AdakrposAuthContext;
      })();
    }

    return authPromise;
  };
}

function setAuthContext(c: Context, client: AdakrposAuthClient): void {
  const cookieHeader = c.req.header("Cookie") ?? "";
  c.set("auth", createAuthFn(client, getSessionId(cookieHeader)));
}

export function adakrposAuth(config: AdakrposAuthConfig) {
  const client = createAdakrposAuth(config);

  return createMiddleware(async (c, next) => {
    setAuthContext(c, client);
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
    setAuthContext(c, client);

    if (!(await getAuth(c)).isAuthenticated) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  });
}
