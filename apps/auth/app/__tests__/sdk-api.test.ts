import { beforeEach, describe, expect, it } from "vitest";
import type { AppLoadContext } from "react-router";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { createDb } from "~/db/index";
import { developerApps } from "~/db/schema";
import { generateApiKey, getApiKeyPrefix, hashApiKey } from "~/lib/apikey.server";
import { createUser } from "~/lib/user.server";
import { createTestSession } from "./setup";
import type { Env } from "~/types/env";
import { action as verifyKeyAction } from "~/routes/api.sdk.verify-key";
import { action as verifySessionAction } from "~/routes/api.sdk.verify-session";
import { loader as userLoader } from "~/routes/api.sdk.users.$id";

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
    cohort text,
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

async function createTestApp(db: Db, userId: string, isActive = true) {
  const apiKey = generateApiKey();
  const appId = crypto.randomUUID();
  const now = new Date();

  await db.insert(developerApps).values({
    id: appId,
    userId,
    name: `SDK Test App ${appId}`,
    description: "SDK test app",
    apiKeyHash: await hashApiKey(apiKey),
    apiKeyPrefix: getApiKeyPrefix(apiKey),
    isActive,
    createdAt: now,
    updatedAt: now,
  });

  return { appId, apiKey };
}

describe("SDK API routes", () => {
  let db: Db;
  let context: AppLoadContext;

  beforeEach(async () => {
    await resetTables();
    db = createDb(bindings.DB);
    context = makeContext();
  });

  describe("POST /api/sdk/verify-key", () => {
    it("returns 401 when Authorization header is missing", async () => {
      const request = new Request("https://example.com/api/sdk/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await verifyKeyAction({ request, context, params: {} } as any);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Missing API key" });
    });

    it("returns 403 for unknown or inactive API keys", async () => {
      await createUser(db, {
        id: "sdk-user-inactive",
        appleEmail: "inactive@example.com",
        name: "Inactive SDK User",
      });
      const { apiKey } = await createTestApp(db, "sdk-user-inactive", false);

      const request = new Request("https://example.com/api/sdk/verify-key", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const response = await verifyKeyAction({ request, context, params: {} } as any);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "Invalid API key" });
    });

    it("returns valid true for an active API key", async () => {
      await createUser(db, {
        id: "sdk-user-valid-key",
        appleEmail: "valid@example.com",
        name: "Valid SDK User",
      });
      const { apiKey } = await createTestApp(db, "sdk-user-valid-key");

      const request = new Request("https://example.com/api/sdk/verify-key", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const response = await verifyKeyAction({ request, context, params: {} } as any);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ valid: true });
    });

    it("returns 429 after 100 requests in the same minute window", async () => {
      await createUser(db, {
        id: "sdk-user-rate-limit",
        appleEmail: "rate-limit@example.com",
        name: "Rate Limit SDK User",
      });
      const { apiKey } = await createTestApp(db, "sdk-user-rate-limit");

      const request = new Request("https://example.com/api/sdk/verify-key", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      let response: Response = new Response(null, { status: 500 });

      for (let i = 0; i < 101; i += 1) {
        response = await verifyKeyAction({ request, context, params: {} } as any);
      }

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toEqual({ error: "Rate limit exceeded" });
    });
  });

  describe("POST /api/sdk/verify-session", () => {
    it("returns user and session for a valid session", async () => {
      await createUser(db, {
        id: "sdk-user-session",
        appleEmail: "session@example.com",
        name: "Session SDK User",
      });
      const { apiKey } = await createTestApp(db, "sdk-user-session");
      const { sessionId, session } = await createTestSession(bindings.SESSIONS, "sdk-user-session");

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
        user: { id: string; email: string | null };
        session: { id: string; userId: string; createdAt: number; expiresAt: number };
      };

      expect(body.user.id).toBe("sdk-user-session");
      expect(body.user.email).toBe("session@example.com");
      expect(body.session).toEqual({
        id: sessionId,
        userId: "sdk-user-session",
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      });
    });

    it("returns 404 when the session does not exist", async () => {
      await createUser(db, {
        id: "sdk-user-missing-session",
        appleEmail: "missing-session@example.com",
        name: "Missing Session SDK User",
      });
      const { apiKey } = await createTestApp(db, "sdk-user-missing-session");

      const request = new Request("https://example.com/api/sdk/verify-session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: "missing-session-id" }),
      });

      const response = await verifySessionAction({ request, context, params: {} } as any);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Session not found" });
    });
  });

  describe("GET /api/sdk/users/:id", () => {
    it("returns the requested user for a valid API key", async () => {
      await createUser(db, {
        id: "sdk-user-target",
        appleEmail: "target@example.com",
        name: "Target SDK User",
      });
      await createUser(db, {
        id: "sdk-user-caller",
        appleEmail: "caller@example.com",
        name: "Caller SDK User",
      });
      const { apiKey } = await createTestApp(db, "sdk-user-caller");

      const request = new Request("https://example.com/api/sdk/users/sdk-user-target", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const response = await userLoader({
        request,
        context,
        params: { id: "sdk-user-target" },
      } as any);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { id: string; email: string | null; name: string | null };
      expect(body.id).toBe("sdk-user-target");
      expect(body.email).toBe("target@example.com");
      expect(body.name).toBe("Target SDK User");
    });

    it("returns 404 when the requested user does not exist", async () => {
      await createUser(db, {
        id: "sdk-user-caller-404",
        appleEmail: "caller404@example.com",
        name: "Caller SDK User 404",
      });
      const { apiKey } = await createTestApp(db, "sdk-user-caller-404");

      const request = new Request("https://example.com/api/sdk/users/missing-user", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const response = await userLoader({
        request,
        context,
        params: { id: "missing-user" },
      } as any);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "User not found" });
    });

    it("keeps stored API key hashes opaque", async () => {
      await createUser(db, {
        id: "sdk-user-opaque",
        appleEmail: "opaque@example.com",
        name: "Opaque SDK User",
      });
      const { appId, apiKey } = await createTestApp(db, "sdk-user-opaque");

      const request = new Request("https://example.com/api/sdk/verify-key", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const response = await verifyKeyAction({ request, context, params: {} } as any);
      const app = await db
        .select({ apiKeyHash: developerApps.apiKeyHash })
        .from(developerApps)
        .where(and(eq(developerApps.id, appId), eq(developerApps.userId, "sdk-user-opaque")))
        .get();

      expect(response.status).toBe(200);
      const body = (await response.json()) as { valid: boolean; apiKeyHash?: string };
      expect(body).toEqual({ valid: true });
      expect(app?.apiKeyHash).toBeDefined();
      expect(body.apiKeyHash).toBeUndefined();
    });
  });
});
