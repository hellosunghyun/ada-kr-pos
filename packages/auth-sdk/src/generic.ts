import { createAdakrposAuth } from "./client";
import type { AdakrposAuthConfig } from "./client";
import type {
  AdakrposAuthContext,
  AdakrposLogFn,
  AdakrposUnauthContext,
  AuthContext,
} from "./types";

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

// Framework-agnostic helper using Web standard Request
// Works with CF Workers, Deno, Bun, and any Web standard environment
export async function verifyRequest(
  request: Request,
  config: AdakrposAuthConfig,
): Promise<AuthContext> {
  const client = createAdakrposAuth(config);

  const cookieHeader = request.headers.get("Cookie") ?? "";
  const sessionId = getSessionId(cookieHeader, config.logger);

  if (!sessionId) {
    config.logger?.("info", "Auth resolved", { isAuthenticated: false });
    return UNAUTH_CONTEXT;
  }

  const result = await client.verifySession(sessionId);
  if (!result) {
    config.logger?.("info", "Auth resolved", { isAuthenticated: false });
    return UNAUTH_CONTEXT;
  }

  config.logger?.("info", "Auth resolved", { isAuthenticated: true });

  return {
    user: result.user,
    session: result.session,
    isAuthenticated: true,
  } satisfies AdakrposAuthContext;
}
