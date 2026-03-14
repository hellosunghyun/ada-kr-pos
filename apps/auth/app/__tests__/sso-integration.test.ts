import { beforeEach, describe, expect, it } from "vitest";
import type { AppLoadContext } from "react-router";
import { env } from "cloudflare:workers";
import { createDb } from "~/db/index";
import { developerApps } from "~/db/schema";
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "~/lib/apikey.server";
import { setSessionCookie } from "~/lib/cookie.server";
import { createSession, getSession } from "~/lib/session.server";
import { createUser } from "~/lib/user.server";
import { action as logoutAction } from "~/routes/api.auth.logout";
import { action as verifySessionAction } from "~/routes/api.sdk.verify-session";
import type { Env } from "~/types/env";

const USERS_TABLE_SQL = `
  CREATE TABLE users (
    id text PRIMARY KEY NOT NULL,
    apple_sub text,
    apple_email text,
    verified_email text,
    nickname text,
    name text,
    profile_photo_url text,
    bio text,
    contact text,
    sns_links text DEFAULT '{}',
    is_verified integer DEFAULT false NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )
`;

const DEVELOPER_APPS_TABLE_SQL = `
  CREATE TABLE developer_apps (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    api_key_hash text NOT NULL,
    api_key_prefix text NOT NULL,
    redirect_urls text DEFAULT '[]',
    is_active integer DEFAULT true NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )
`;

type Db = ReturnType<typeof createDb>;
const bindings = env as unknown as Env;

function makeContext(): AppLoadContext {
  return {
    cloudflare: {
      env: bindings,
      ctx: {} as ExecutionContext,
    },
  } as AppLoadContext;
}

async function resetTables() {
  await bindings.DB.prepare("DROP TABLE IF EXISTS developer_apps").run();
  await bindings.DB.prepare("DROP TABLE IF EXISTS users").run();
  await bindings.DB.prepare(USERS_TABLE_SQL).run();
  await bindings.DB.prepare(DEVELOPER_APPS_TABLE_SQL).run();
}

describe("SSO integration", () => {
  let db: Db;
  let context: AppLoadContext;

  beforeEach(async () => {
    await resetTables();
    db = createDb(bindings.DB);
    context = makeContext();
  });

   it("adapts cookie domain based on environment value", () => {
     const expiresAt = Date.now() + 60 * 60 * 1000;

     const prodCookie = setSessionCookie("session-prod", expiresAt, ".ada-kr-pos.com");
     const localCookie = setSessionCookie("session-local", expiresAt, "");

     expect(prodCookie).toContain("Domain=.ada-kr-pos.com");
     expect(localCookie).not.toContain("Domain=");
   });

   it("sets SSO-safe cookie attributes", () => {
     const expiresAt = Date.now() + 60 * 60 * 1000;
     const cookie = setSessionCookie("session-attrs", expiresAt, ".ada-kr-pos.com");

    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("SameSite=Strict");
  });

  it("verifies session via SDK endpoint end-to-end", async () => {
    const userId = `sso_user_${crypto.randomUUID()}`;
    const appId = crypto.randomUUID();
    const apiKey = generateApiKey();
    const now = new Date();

    await createUser(db, {
      id: userId,
      appleEmail: "sso-user@example.com",
      name: "SSO User",
    });

    const { sessionId } = await createSession(bindings.SESSIONS, userId);

    await db.insert(developerApps).values({
      id: appId,
      userId,
      name: "SSO Test App",
      apiKeyHash: await hashApiKey(apiKey),
      apiKeyPrefix: getApiKeyPrefix(apiKey),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const request = new Request("https://example.com/api/sdk/verify-session", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });

    const response = await verifySessionAction({ request, context, params: {} } as any);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      user: { id: string };
      session: { id: string };
    };

    expect(body.user.id).toBe(userId);
    expect(body.session.id).toBe(sessionId);
  });

  it("extends session expiry after sliding-window threshold", async () => {
    const userId = `sliding_${crypto.randomUUID()}`;
    const sessionId = crypto.randomUUID();
    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const oldExpiresAt = now + ttlMs / 2 - 1000;

    await bindings.SESSIONS.put(
      `session:${sessionId}`,
      JSON.stringify({
        userId,
        expiresAt: oldExpiresAt,
        createdAt: now - ttlMs / 2 - 1000,
      }),
      { expirationTtl: 60 }
    );

    const session = await getSession(bindings.SESSIONS, sessionId);

    expect(session).not.toBeNull();
    expect(session!.expiresAt).toBeGreaterThan(oldExpiresAt);
  });

  it("deletes KV session on logout", async () => {
    const userId = `logout_${crypto.randomUUID()}`;
    const { sessionId } = await createSession(bindings.SESSIONS, userId);

    const request = new Request("https://example.com/api/auth/logout", {
      method: "POST",
      headers: {
        Cookie: `session=${sessionId}`,
      },
    });

    const response = await logoutAction({ request, context, params: {} } as any);
    const stored = await bindings.SESSIONS.get(`session:${sessionId}`);

    expect(response.status).toBe(302);
    expect(stored).toBeNull();
  });
});
