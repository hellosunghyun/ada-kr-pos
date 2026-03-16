import type {
  AdakrposAuthContext,
  AdakrposUnauthContext,
  AdakrposUser,
  AuthContext,
} from "@adakrpos/auth";
import { eq } from "drizzle-orm";
import { redirect } from "react-router";
import type { AppLoadContext } from "react-router";
import { createDb } from "~/db/index";
import { users } from "~/db/schema";
import { getSessionIdFromCookie } from "~/lib/cookie.server";
import { log } from "~/lib/logger.server";
import { getSession } from "~/lib/session.server";

async function getUserById(
  db: ReturnType<typeof createDb>,
  userId: string,
): Promise<AdakrposUser | null> {
  try {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!user) return null;

    let snsLinks: Record<string, string> = {};
    try {
      snsLinks = user.snsLinks ? JSON.parse(user.snsLinks) : {};
    } catch (error) {
      log("debug", "Auth context resolution error", { error });
      snsLinks = {};
    }

    return {
      id: user.id,
      email: user.appleEmail ?? null,
      verifiedEmail: user.verifiedEmail ?? null,
      nickname: user.nickname ?? null,
      name: user.name ?? null,
      profilePhotoUrl: user.profilePhotoUrl ?? null,
      bio: user.bio ?? null,
      contact: user.contact ?? null,
      snsLinks,
      cohort: user.cohort ?? null,
      isVerified: user.isVerified,
      createdAt: user.createdAt.getTime(),
      updatedAt: user.updatedAt.getTime(),
    };
  } catch (error) {
    log("debug", "Auth context resolution error", { error });
    return null;
  }
}

async function getAuthContext(
  request: Request,
  context: AppLoadContext,
): Promise<AuthContext> {
  log("debug", "Auth context: resolving session");

  const env = context.cloudflare.env;
  const kv = env.SESSIONS;
  const db = createDb(env.DB);

  const cookieHeader = request.headers.get("Cookie");
  const sessionId = getSessionIdFromCookie(cookieHeader);

  if (!sessionId) {
    log("debug", "Auth context: no session found");

    return {
      user: null,
      session: null,
      isAuthenticated: false,
    } as AdakrposUnauthContext;
  }

  const session = await getSession(kv, sessionId);

  if (!session) {
    log("debug", "Auth context: no session found");

    return {
      user: null,
      session: null,
      isAuthenticated: false,
    } as AdakrposUnauthContext;
  }

  const user = await getUserById(db, session.userId);

  if (!user) {
    return {
      user: null,
      session: null,
      isAuthenticated: false,
    } as AdakrposUnauthContext;
  }

  log("info", "Auth context: session validated", { userId: session.userId });

  return {
    user,
    session: {
      id: sessionId,
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    },
    isAuthenticated: true,
  } as AdakrposAuthContext;
}

export async function requireAuthPage(
  request: Request,
  context: AppLoadContext,
): Promise<AdakrposAuthContext> {
  const authContext = await getAuthContext(request, context);

  if (!authContext.isAuthenticated) {
    const url = new URL(request.url);
    const currentPath = url.pathname + url.search;
    log("warn", "Auth required for page: redirecting to login", {
      path: currentPath,
    });
    const loginUrl =
      currentPath === "/mypage"
        ? "/login"
        : `/login?callbackUrl=${encodeURIComponent(url.href)}`;
    throw redirect(loginUrl);
  }

  return authContext as AdakrposAuthContext;
}

export async function requireAuthApi(
  request: Request,
  context: AppLoadContext,
): Promise<AdakrposAuthContext> {
  const authContext = await getAuthContext(request, context);

  if (!authContext.isAuthenticated) {
    log("warn", "Auth required for API: returning 401");

    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return authContext as AdakrposAuthContext;
}

export async function optionalAuth(
  request: Request,
  context: AppLoadContext,
): Promise<AuthContext> {
  return getAuthContext(request, context);
}
