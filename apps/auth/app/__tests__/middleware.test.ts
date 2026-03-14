import { describe, it, expect, beforeEach } from "vitest";
import { createTestSession } from "./setup";
import { validateCsrf } from "~/middleware/csrf.server";
import {
  requireAuthPage,
  requireAuthApi,
  optionalAuth,
} from "~/middleware/auth.server";
import type { AppLoadContext } from "react-router";

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();

  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

function createMockD1(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

function makeContext(kv: KVNamespace, d1: D1Database): AppLoadContext {
  return {
    cloudflare: {
      env: {
        DB: d1,
        SESSIONS: kv,
        EMAIL_TOKENS: createMockKV(),
        MAGIC_TOKENS: createMockKV(),
        RATE_LIMITS: createMockKV(),
        PROFILE_PHOTOS: {} as R2Bucket,
        APPLE_CLIENT_ID: "test-client-id",
        APPLE_TEAM_ID: "test-team-id",
        APPLE_KEY_ID: "test-key-id",
        APPLE_PRIVATE_KEY: "test-private-key",
        RESEND_API_KEY: "test-resend-key",
        AUTH_SECRET: "test-auth-secret",
         COOKIE_DOMAIN: ".ada-kr-pos.com",
      },
      ctx: {} as ExecutionContext,
    },
  } as any;
}

describe("CSRF Validation", () => {
  describe("validateCsrf", () => {
    it("passes GET requests without checking Origin", async () => {
      const request = new Request("https://example.com/api/data", {
        method: "GET",
      });

      // Should not throw
      await expect(validateCsrf(request)).resolves.toBeUndefined();
    });

    it("passes HEAD requests without checking Origin", async () => {
      const request = new Request("https://example.com/api/data", {
        method: "HEAD",
      });

      // Should not throw
      await expect(validateCsrf(request)).resolves.toBeUndefined();
    });

    it("passes OPTIONS requests without checking Origin", async () => {
      const request = new Request("https://example.com/api/data", {
        method: "OPTIONS",
      });

      // Should not throw
      await expect(validateCsrf(request)).resolves.toBeUndefined();
    });

    it("throws 403 for POST without Origin header", async () => {
      const request = new Request("https://example.com/api/data", {
        method: "POST",
      });

      await expect(validateCsrf(request)).rejects.toThrow();
      try {
        await validateCsrf(request);
      } catch (e) {
        if (e instanceof Response) {
          expect(e.status).toBe(403);
        }
      }
    });

    it("throws 403 for POST with mismatched Origin header", async () => {
      const request = new Request("https://example.com/api/data", {
        method: "POST",
        headers: {
          Origin: "https://evil.com",
        },
      });

      await expect(validateCsrf(request)).rejects.toThrow();
      try {
        await validateCsrf(request);
      } catch (e) {
        if (e instanceof Response) {
          expect(e.status).toBe(403);
        }
      }
    });

    it("passes POST with matching Origin header", async () => {
      const request = new Request("https://example.com/api/data", {
        method: "POST",
        headers: {
          Origin: "https://example.com",
        },
      });

      // Should not throw
      await expect(validateCsrf(request)).resolves.toBeUndefined();
    });

    it("throws 403 for PUT without Origin header", async () => {
      const request = new Request("https://example.com/api/data", {
        method: "PUT",
      });

      await expect(validateCsrf(request)).rejects.toThrow();
    });

    it("throws 403 for PATCH without Origin header", async () => {
      const request = new Request("https://example.com/api/data", {
        method: "PATCH",
      });

      await expect(validateCsrf(request)).rejects.toThrow();
    });

    it("throws 403 for DELETE without Origin header", async () => {
      const request = new Request("https://example.com/api/data", {
        method: "DELETE",
      });

      await expect(validateCsrf(request)).rejects.toThrow();
    });
  });
});

describe("Auth Middleware", () => {
  let kv: KVNamespace;
  let d1: D1Database;
  let context: AppLoadContext;

  beforeEach(() => {
    kv = createMockKV();
    d1 = createMockD1();
    context = makeContext(kv, d1);
  });

  describe("requireAuthPage", () => {
    it("throws redirect to /login for missing session cookie", async () => {
      const request = new Request("https://example.com/dashboard", {
        method: "GET",
      });

      try {
        await requireAuthPage(request, context);
        expect.fail("Should have thrown redirect");
      } catch (e) {
        if (e instanceof Response) {
          expect(e.status).toBe(302);
          expect(e.headers.get("Location")).toBe("/login");
        } else {
          throw e;
        }
      }
    });

    it("throws redirect to /login for invalid session ID", async () => {
      const request = new Request("https://example.com/dashboard", {
        method: "GET",
        headers: {
          Cookie: "session=invalid-session-id",
        },
      });

      try {
        await requireAuthPage(request, context);
        expect.fail("Should have thrown redirect");
      } catch (e) {
        if (e instanceof Response) {
          expect(e.status).toBe(302);
          expect(e.headers.get("Location")).toBe("/login");
        } else {
          throw e;
        }
      }
    });

    it("throws redirect to /login when session exists but user not found", async () => {
      const { sessionId } = await createTestSession(kv, "nonexistent-user");

      const request = new Request("https://example.com/dashboard", {
        method: "GET",
        headers: {
          Cookie: `session=${sessionId}`,
        },
      });

      try {
        await requireAuthPage(request, context);
        expect.fail("Should have thrown redirect");
      } catch (e) {
        if (e instanceof Response) {
          expect(e.status).toBe(302);
          expect(e.headers.get("Location")).toBe("/login");
        } else {
          throw e;
        }
      }
    });
  });

  describe("requireAuthApi", () => {
    it("throws 401 JSON response for missing session cookie", async () => {
      const request = new Request("https://example.com/api/user", {
        method: "GET",
      });

      try {
        await requireAuthApi(request, context);
        expect.fail("Should have thrown 401");
      } catch (e) {
        if (e instanceof Response) {
          expect(e.status).toBe(401);
          expect(e.headers.get("Content-Type")).toBe("application/json");
          const body = (await e.json()) as { error: string };
          expect(body.error).toBe("Unauthorized");
        } else {
          throw e;
        }
      }
    });

    it("throws 401 JSON response for invalid session ID", async () => {
      const request = new Request("https://example.com/api/user", {
        method: "GET",
        headers: {
          Cookie: "session=invalid-session-id",
        },
      });

      try {
        await requireAuthApi(request, context);
        expect.fail("Should have thrown 401");
      } catch (e) {
        if (e instanceof Response) {
          expect(e.status).toBe(401);
          expect(e.headers.get("Content-Type")).toBe("application/json");
        } else {
          throw e;
        }
      }
    });

    it("throws 401 JSON response when session exists but user not found", async () => {
      const { sessionId } = await createTestSession(kv, "nonexistent-user");

      const request = new Request("https://example.com/api/user", {
        method: "GET",
        headers: {
          Cookie: `session=${sessionId}`,
        },
      });

      try {
        await requireAuthApi(request, context);
        expect.fail("Should have thrown 401");
      } catch (e) {
        if (e instanceof Response) {
          expect(e.status).toBe(401);
          expect(e.headers.get("Content-Type")).toBe("application/json");
        } else {
          throw e;
        }
      }
    });
  });

  describe("optionalAuth", () => {
    it("returns AdaposUnauthContext for missing session cookie (no throw)", async () => {
      const request = new Request("https://example.com/home", {
        method: "GET",
      });

      const result = await optionalAuth(request, context);

      expect(result.isAuthenticated).toBe(false);
      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
    });

    it("returns AdaposUnauthContext for invalid session ID (no throw)", async () => {
      const request = new Request("https://example.com/home", {
        method: "GET",
        headers: {
          Cookie: "session=invalid-session-id",
        },
      });

      const result = await optionalAuth(request, context);

      expect(result.isAuthenticated).toBe(false);
      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
    });

    it("returns AdaposUnauthContext when session exists but user not found (no throw)", async () => {
      const { sessionId } = await createTestSession(kv, "nonexistent-user");

      const request = new Request("https://example.com/home", {
        method: "GET",
        headers: {
          Cookie: `session=${sessionId}`,
        },
      });

      const result = await optionalAuth(request, context);

      expect(result.isAuthenticated).toBe(false);
      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
    });
  });
});
