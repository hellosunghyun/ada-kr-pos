import { createAdakrposAuth } from "./client";
import type { AdakrposAuthConfig } from "./client";
import type { AuthContext, AdakrposAuthContext, AdakrposUnauthContext } from "./types";

// Augment Express Request type
declare global {
  namespace Express {
    interface Request {
      auth?: () => Promise<AuthContext>;
    }
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

function createAuthFn(client: any, sessionId: string | null): () => Promise<AuthContext> {
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

// Express middleware — attaches lazy auth function to req
export function adakrposAuthExpress(config: AdakrposAuthConfig) {
  const client = createAdakrposAuth(config);

  return async (req: any, res: any, next: any) => {
    const cookieHeader = req.headers?.cookie ?? "";
    const sessionId = getSessionId(cookieHeader);

    // Lazy function — only calls server when invoked
    req.auth = createAuthFn(client, sessionId);

    next();
  };
}

// Express middleware that requires authentication
export function requireAuthExpress(config: AdakrposAuthConfig) {
  const client = createAdakrposAuth(config);

  return async (req: any, res: any, next: any) => {
    const cookieHeader = req.headers?.cookie ?? "";
    const sessionId = getSessionId(cookieHeader);

    req.auth = createAuthFn(client, sessionId);

    const auth = await req.auth();
    if (!auth?.isAuthenticated) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    next();
  };
}
