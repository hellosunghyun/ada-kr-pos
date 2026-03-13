import { beforeEach, describe, expect, it } from "vitest";
import type { AppLoadContext } from "react-router";
import { env } from "cloudflare:workers";
import { createDb } from "~/db/index";
import { createTestSession } from "./setup";
import type { Env } from "~/types/env";
import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  getApiKeyPrefix,
} from "~/lib/apikey.server";
import { loader as appsLoader, action as appsAction } from "~/routes/api.developer.apps";
import { action as appsIdAction } from "~/routes/api.developer.apps.$id";
import { createUser } from "~/lib/user.server";

const USERS_TABLE_SQL = `
  CREATE TABLE users (
    id text PRIMARY KEY NOT NULL,
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

describe("API Key Utilities", () => {
  describe("generateApiKey", () => {
    it("starts with 'ak_' prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("ak_")).toBe(true);
    });

    it("generates unique keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe("hashApiKey", () => {
    it("returns a 64-character hex string (SHA-256)", async () => {
      const key = generateApiKey();
      const hash = await hashApiKey(key);
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it("produces consistent hash for same input", async () => {
      const key = "ak_test-key-123";
      const hash1 = await hashApiKey(key);
      const hash2 = await hashApiKey(key);
      expect(hash1).toBe(hash2);
    });
  });

  describe("verifyApiKey", () => {
    it("returns true for correct key", async () => {
      const key = generateApiKey();
      const hash = await hashApiKey(key);
      const result = await verifyApiKey(key, hash);
      expect(result).toBe(true);
    });

    it("returns false for wrong key", async () => {
      const key = generateApiKey();
      const hash = await hashApiKey(key);
      const result = await verifyApiKey("ak_wrong-key", hash);
      expect(result).toBe(false);
    });
  });

  describe("getApiKeyPrefix", () => {
    it("returns first 11 characters (ak_ + 8 chars)", () => {
      const key = "ak_12345678-1234-5678-1234-567812345678";
      const prefix = getApiKeyPrefix(key);
      expect(prefix).toBe("ak_12345678");
      expect(prefix).toHaveLength(11);
    });
  });
});

describe("Developer Apps API", () => {
  let db: Db;
  let context: AppLoadContext;

  beforeEach(async () => {
    await resetTables();
    db = createDb(bindings.DB);
    context = makeContext();
  });

  describe("GET /api/developer/apps", () => {
    it("returns 403 for unverified user", async () => {
      await createUser(db, {
        id: "unverified-user",
        appleEmail: "unverified@example.com",
        name: "Unverified User",
      });
      const { sessionId } = await createTestSession(bindings.SESSIONS, "unverified-user");

      const request = new Request("https://example.com/api/developer/apps", {
        method: "GET",
        headers: { Cookie: `session=${sessionId}` },
      });

      const response = await appsLoader({ request, context, params: {} } as any);
      expect(response.status).toBe(403);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Email verification required");
    });

    it("returns 200 and empty array for verified user with no apps", async () => {
      await createUser(db, {
        id: "verified-user",
        appleEmail: "verified@example.com",
        name: "Verified User",
      });
      await bindings.DB.prepare(
        "UPDATE users SET is_verified = 1 WHERE id = ?"
      ).bind("verified-user").run();
      const { sessionId } = await createTestSession(bindings.SESSIONS, "verified-user");

      const request = new Request("https://example.com/api/developer/apps", {
        method: "GET",
        headers: { Cookie: `session=${sessionId}` },
      });

      const response = await appsLoader({ request, context, params: {} } as any);
      expect(response.status).toBe(200);

      const body = (await response.json()) as { apps: unknown[] };
      expect(body.apps).toEqual([]);
    });
  });

  describe("POST /api/developer/apps", () => {
    it("creates app and returns full API key once", async () => {
      await createUser(db, {
        id: "app-creator",
        appleEmail: "creator@example.com",
        name: "App Creator",
      });
      await bindings.DB.prepare(
        "UPDATE users SET is_verified = 1 WHERE id = ?"
      ).bind("app-creator").run();
      const { sessionId } = await createTestSession(bindings.SESSIONS, "app-creator");

      const request = new Request("https://example.com/api/developer/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: `session=${sessionId}`,
        },
        body: JSON.stringify({ name: "Test App", description: "A test app" }),
      });

      const response = await appsAction({ request, context, params: {} } as any);
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        app: { id: string; name: string; apiKey: string; apiKeyPrefix: string };
      };

      expect(body.app.name).toBe("Test App");
      expect(body.app.apiKey).toBeDefined();
      expect(body.app.apiKey.startsWith("ak_")).toBe(true);
      expect(body.app.apiKeyPrefix).toBe(getApiKeyPrefix(body.app.apiKey));
    });

    it("returns 400 when name is missing", async () => {
      await createUser(db, {
        id: "app-creator2",
        appleEmail: "creator2@example.com",
        name: "App Creator 2",
      });
      await bindings.DB.prepare(
        "UPDATE users SET is_verified = 1 WHERE id = ?"
      ).bind("app-creator2").run();
      const { sessionId } = await createTestSession(bindings.SESSIONS, "app-creator2");

      const request = new Request("https://example.com/api/developer/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: `session=${sessionId}`,
        },
        body: JSON.stringify({ description: "No name" }),
      });

      const response = await appsAction({ request, context, params: {} } as any);
      expect(response.status).toBe(400);

      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("App name is required");
    });

    it("GET after creation returns only apiKeyPrefix (no full key)", async () => {
      await createUser(db, {
        id: "app-creator3",
        appleEmail: "creator3@example.com",
        name: "App Creator 3",
      });
      await bindings.DB.prepare(
        "UPDATE users SET is_verified = 1 WHERE id = ?"
      ).bind("app-creator3").run();
      const { sessionId } = await createTestSession(bindings.SESSIONS, "app-creator3");

      const createRequest = new Request("https://example.com/api/developer/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: `session=${sessionId}`,
        },
        body: JSON.stringify({ name: "Another App" }),
      });

      const createResponse = await appsAction({
        request: createRequest,
        context,
        params: {},
      } as any);
      const createBody = (await createResponse.json()) as {
        app: { apiKey: string };
      };
      const fullApiKey = createBody.app.apiKey;

      const getRequest = new Request("https://example.com/api/developer/apps", {
        method: "GET",
        headers: { Cookie: `session=${sessionId}` },
      });

      const getResponse = await appsLoader({
        request: getRequest,
        context,
        params: {},
      } as any);
      const getBody = (await getResponse.json()) as {
        apps: Array<{ apiKeyPrefix: string; apiKey?: string }>;
      };

      expect(getBody.apps).toHaveLength(1);
      expect(getBody.apps[0].apiKeyPrefix).toBe(getApiKeyPrefix(fullApiKey));
      expect(getBody.apps[0].apiKey).toBeUndefined();
    });
  });

  describe("DELETE /api/developer/apps/:id", () => {
    it("deletes app owned by user", async () => {
      await createUser(db, {
        id: "app-deleter",
        appleEmail: "deleter@example.com",
        name: "App Deleter",
      });
      await bindings.DB.prepare(
        "UPDATE users SET is_verified = 1 WHERE id = ?"
      ).bind("app-deleter").run();
      const { sessionId } = await createTestSession(bindings.SESSIONS, "app-deleter");

      const createRequest = new Request("https://example.com/api/developer/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: `session=${sessionId}`,
        },
        body: JSON.stringify({ name: "App to Delete" }),
      });

      const createResponse = await appsAction({
        request: createRequest,
        context,
        params: {},
      } as any);
      const createBody = (await createResponse.json()) as { app: { id: string } };
      const appId = createBody.app.id;

      const deleteRequest = new Request(
        `https://example.com/api/developer/apps/${appId}`,
        {
          method: "DELETE",
          headers: {
            Origin: "https://example.com",
            Cookie: `session=${sessionId}`,
          },
        }
      );

      const deleteResponse = await appsIdAction({
        request: deleteRequest,
        context,
        params: { id: appId },
      } as any);
      expect(deleteResponse.status).toBe(200);

      const deleteBody = (await deleteResponse.json()) as { success: boolean };
      expect(deleteBody.success).toBe(true);

      const getRequest = new Request("https://example.com/api/developer/apps", {
        method: "GET",
        headers: { Cookie: `session=${sessionId}` },
      });

      const getResponse = await appsLoader({
        request: getRequest,
        context,
        params: {},
      } as any);
      const getBody = (await getResponse.json()) as { apps: unknown[] };
      expect(getBody.apps).toHaveLength(0);
    });

    it("returns 404 for app owned by different user", async () => {
      await createUser(db, {
        id: "owner-user",
        appleEmail: "owner@example.com",
        name: "Owner User",
      });
      await createUser(db, {
        id: "other-user",
        appleEmail: "other@example.com",
        name: "Other User",
      });
      await bindings.DB.prepare(
        "UPDATE users SET is_verified = 1 WHERE id = ?"
      ).bind("owner-user").run();
      await bindings.DB.prepare(
        "UPDATE users SET is_verified = 1 WHERE id = ?"
      ).bind("other-user").run();

      const { sessionId: ownerSession } = await createTestSession(
        bindings.SESSIONS,
        "owner-user"
      );
      const { sessionId: otherSession } = await createTestSession(
        bindings.SESSIONS,
        "other-user"
      );

      const createRequest = new Request("https://example.com/api/developer/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: `session=${ownerSession}`,
        },
        body: JSON.stringify({ name: "Owner's App" }),
      });

      const createResponse = await appsAction({
        request: createRequest,
        context,
        params: {},
      } as any);
      const createBody = (await createResponse.json()) as { app: { id: string } };
      const appId = createBody.app.id;

      const deleteRequest = new Request(
        `https://example.com/api/developer/apps/${appId}`,
        {
          method: "DELETE",
          headers: {
            Origin: "https://example.com",
            Cookie: `session=${otherSession}`,
          },
        }
      );

      const deleteResponse = await appsIdAction({
        request: deleteRequest,
        context,
        params: { id: appId },
      } as any);
      expect(deleteResponse.status).toBe(404);
    });
  });

  describe("PATCH /api/developer/apps/:id", () => {
    it("updates app name and description", async () => {
      await createUser(db, {
        id: "app-updater",
        appleEmail: "updater@example.com",
        name: "App Updater",
      });
      await bindings.DB.prepare(
        "UPDATE users SET is_verified = 1 WHERE id = ?"
      ).bind("app-updater").run();
      const { sessionId } = await createTestSession(bindings.SESSIONS, "app-updater");

      const createRequest = new Request("https://example.com/api/developer/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
          Cookie: `session=${sessionId}`,
        },
        body: JSON.stringify({ name: "Original Name" }),
      });

      const createResponse = await appsAction({
        request: createRequest,
        context,
        params: {},
      } as any);
      const createBody = (await createResponse.json()) as { app: { id: string } };
      const appId = createBody.app.id;

      const patchRequest = new Request(
        `https://example.com/api/developer/apps/${appId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://example.com",
            Cookie: `session=${sessionId}`,
          },
          body: JSON.stringify({ name: "Updated Name", description: "New description" }),
        }
      );

      const patchResponse = await appsIdAction({
        request: patchRequest,
        context,
        params: { id: appId },
      } as any);
      expect(patchResponse.status).toBe(200);

      const patchBody = (await patchResponse.json()) as {
        app: { name: string; description: string };
      };
      expect(patchBody.app.name).toBe("Updated Name");
      expect(patchBody.app.description).toBe("New description");
    });
  });
});
