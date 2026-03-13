import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { createAdaposAuth } from "./client";
import type { AdaposAuthClient, AdaposAuthConfig } from "./client";
import type { AdaposAuthContext, AuthContext, AdaposUnauthContext } from "./types";

type AuthFn = () => Promise<AuthContext>;

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthFn;
  }
}

const UNAUTH_CONTEXT: AdaposUnauthContext = {
  user: null,
  session: null,
  isAuthenticated: false,
};

function getSessionId(cookieHeader: string): string | null {
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);

  if (!sessionMatch) {
    return null;
  }

  try {
    return decodeURIComponent(sessionMatch[1]);
  } catch {
    return sessionMatch[1];
  }
}

function createAuthFn(client: AdaposAuthClient, sessionId: string | null): AuthFn {
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
        } satisfies AdaposAuthContext;
      })();
    }

    return authPromise;
  };
}

function setAuthContext(c: Context, client: AdaposAuthClient): void {
  const cookieHeader = c.req.header("Cookie") ?? "";
  c.set("auth", createAuthFn(client, getSessionId(cookieHeader)));
}

export function adaposAuth(config: AdaposAuthConfig) {
  const client = createAdaposAuth(config);

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

export function requireAuth(config: AdaposAuthConfig) {
  const client = createAdaposAuth(config);

  return createMiddleware(async (c, next) => {
    setAuthContext(c, client);

    if (!(await getAuth(c)).isAuthenticated) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  });
}
