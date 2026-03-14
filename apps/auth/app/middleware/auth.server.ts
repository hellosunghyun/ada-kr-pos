import { redirect } from "react-router";
import type { AppLoadContext } from "react-router";
import type {
  AuthContext,
  AdakrposAuthContext,
  AdakrposUnauthContext,
  AdakrposUser,
} from "@adakrpos/auth";
import { getSessionIdFromCookie } from "~/lib/cookie.server";
import { getSession } from "~/lib/session.server";
import { createDb } from "~/db/index";
import { users } from "~/db/schema";
import { eq } from "drizzle-orm";
import type { Env } from "~/types/env";

async function getUserById(
  db: ReturnType<typeof createDb>,
  userId: string
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
    } catch {
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
      isVerified: user.isVerified,
      createdAt: user.createdAt.getTime(),
      updatedAt: user.updatedAt.getTime(),
    };
  } catch {
    return null;
  }
}

async function getAuthContext(
  request: Request,
  context: AppLoadContext
): Promise<AuthContext> {
  const env = (context as any).cloudflare.env as Env;
  const kv = env.SESSIONS;
  const db = createDb(env.DB);

  const cookieHeader = request.headers.get("Cookie");
  const sessionId = getSessionIdFromCookie(cookieHeader);

  if (!sessionId) {
    return {
      user: null,
      session: null,
      isAuthenticated: false,
    } as AdakrposUnauthContext;
  }

  const session = await getSession(kv, sessionId);

  if (!session) {
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
  context: AppLoadContext
): Promise<AdakrposAuthContext> {
  const authContext = await getAuthContext(request, context);

  if (!authContext.isAuthenticated) {
    throw redirect("/login");
  }

  return authContext as AdakrposAuthContext;
}

export async function requireAuthApi(
  request: Request,
  context: AppLoadContext
): Promise<AdakrposAuthContext> {
  const authContext = await getAuthContext(request, context);

  if (!authContext.isAuthenticated) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return authContext as AdakrposAuthContext;
}

export async function optionalAuth(
  request: Request,
  context: AppLoadContext
): Promise<AuthContext> {
  return getAuthContext(request, context);
}
