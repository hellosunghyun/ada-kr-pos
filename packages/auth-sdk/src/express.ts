import { createAdakrposAuth } from "./client";
import type { AdakrposAuthClient, AdakrposAuthConfig } from "./client";
import type {
  AdakrposAuthContext,
  AdakrposLogFn,
  AdakrposUnauthContext,
  AuthContext,
} from "./types";

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

type ExpressLikeRequest = {
  headers?: { cookie?: string };
  auth?: () => Promise<AuthContext>;
};

type ExpressLikeResponse = {
  status: (statusCode: number) => ExpressLikeResponse;
  json: (body: unknown) => unknown;
};

type NextFunction = () => void;

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
): () => Promise<AuthContext> {
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
        } satisfies AdakrposAuthContext;
      })();
    }

    return authPromise;
  };
}

// Express middleware — attaches lazy auth function to req
export function adakrposAuthExpress(config: AdakrposAuthConfig) {
  const client = createAdakrposAuth(config);

  return async (req: ExpressLikeRequest, _res: unknown, next: NextFunction) => {
    const cookieHeader = req.headers?.cookie ?? "";
    const sessionId = getSessionId(cookieHeader, config.logger);

    // Lazy function — only calls server when invoked
    req.auth = createAuthFn(client, sessionId, config.logger);

    next();
  };
}

// Express middleware that requires authentication
export function requireAuthExpress(config: AdakrposAuthConfig) {
  const client = createAdakrposAuth(config);

  return async (
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
    next: NextFunction,
  ) => {
    const cookieHeader = req.headers?.cookie ?? "";
    const sessionId = getSessionId(cookieHeader, config.logger);

    req.auth = createAuthFn(client, sessionId, config.logger);

    const auth = await req.auth();
    if (!auth?.isAuthenticated) {
      config.logger?.("warn", "Auth required: not authenticated");
      return res.status(401).json({ error: "Unauthorized" });
    }

    next();
  };
}
