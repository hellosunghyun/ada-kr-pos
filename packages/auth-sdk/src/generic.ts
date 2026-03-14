import { createAdakrposAuth } from "./client";
import type { AdakrposAuthConfig } from "./client";
import type { AuthContext, AdakrposAuthContext, AdakrposUnauthContext } from "./types";

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

// Framework-agnostic helper using Web standard Request
// Works with CF Workers, Deno, Bun, and any Web standard environment
export async function verifyRequest(
  request: Request,
  config: AdakrposAuthConfig,
): Promise<AuthContext> {
  const client = createAdakrposAuth(config);

  const cookieHeader = request.headers.get("Cookie") ?? "";
  const sessionId = getSessionId(cookieHeader);

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
}
