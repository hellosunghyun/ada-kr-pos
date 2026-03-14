import { describe, it, expect, beforeEach } from "vitest";
import {
  createSession,
  getSession,
  deleteSession,
  registerSessionInUserIndex,
  deleteAllUserSessions,
} from "~/lib/session.server";
import {
  setSessionCookie,
  clearSessionCookie,
  getSessionIdFromCookie,
} from "~/lib/cookie.server";

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

describe("Session Management", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = createMockKV();
  });

  describe("createSession", () => {
    it("creates a session in KV with correct TTL", async () => {
      const { sessionId, expiresAt } = await createSession(kv, "user-123");

      expect(typeof sessionId).toBe("string");
      expect(sessionId).toHaveLength(36);
      expect(expiresAt).toBeGreaterThan(Date.now());

      const raw = await kv.get(`session:${sessionId}`);
      expect(raw).not.toBeNull();

      const session = JSON.parse(raw!);
      expect(session.userId).toBe("user-123");
      expect(session.expiresAt).toBeGreaterThan(Date.now());

      const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
      expect(session.expiresAt).toBeCloseTo(expectedExpiry, -3);
    });
  });

  describe("getSession", () => {
    it("retrieves stored session", async () => {
      const { sessionId } = await createSession(kv, "user-456");

      const session = await getSession(kv, sessionId);

      expect(session).not.toBeNull();
      expect(session!.userId).toBe("user-456");
    });

    it("returns null for non-existent session", async () => {
      const session = await getSession(kv, "non-existent-id");
      expect(session).toBeNull();
    });

    it("extends TTL when more than 50% elapsed (sliding window)", async () => {
      const oldTime = Date.now() - 4 * 24 * 60 * 60 * 1000;
      const sessionId = crypto.randomUUID();
      const session = {
        userId: "user-789",
        createdAt: oldTime,
        expiresAt: oldTime + 7 * 24 * 60 * 60 * 1000,
      };

      await kv.put(`session:${sessionId}`, JSON.stringify(session), {
        expirationTtl: 3 * 24 * 60 * 60,
      });

      const retrieved = await getSession(kv, sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.expiresAt).toBeGreaterThan(
        Date.now() + 6 * 24 * 60 * 60 * 1000
      );
    });
  });

  describe("deleteSession", () => {
    it("removes session from KV", async () => {
      const { sessionId } = await createSession(kv, "user-delete");

      expect(await kv.get(`session:${sessionId}`)).not.toBeNull();

      await deleteSession(kv, sessionId);

      expect(await kv.get(`session:${sessionId}`)).toBeNull();
    });
  });

  describe("deleteAllUserSessions", () => {
    it("removes all registered sessions for a user", async () => {
      const userId = "user-multi";
      const { sessionId: s1 } = await createSession(kv, userId);
      const { sessionId: s2 } = await createSession(kv, userId);

      await registerSessionInUserIndex(kv, userId, s1);
      await registerSessionInUserIndex(kv, userId, s2);

      await deleteAllUserSessions(kv, userId);

      expect(await kv.get(`session:${s1}`)).toBeNull();
      expect(await kv.get(`session:${s2}`)).toBeNull();
    });
  });
});

describe("Cookie Management", () => {
   describe("setSessionCookie", () => {
     it("sets cookie with Domain=.ada-kr-pos.com in production", () => {
       const future = Date.now() + 7 * 24 * 60 * 60 * 1000;
       const cookie = setSessionCookie("sess-123", future, ".ada-kr-pos.com");

       expect(cookie).toContain("adakrpos_session=sess-123");
       expect(cookie).toContain("Domain=.ada-kr-pos.com");
       expect(cookie).toContain("HttpOnly");
       expect(cookie).toContain("Secure");
       expect(cookie).toContain("SameSite=Lax");
       expect(cookie).toContain("Path=/");
       expect(cookie).not.toContain("SameSite=Strict");
     });

     it("sets cookie WITHOUT Domain in local dev (empty COOKIE_DOMAIN)", () => {
       const future = Date.now() + 7 * 24 * 60 * 60 * 1000;
       const cookie = setSessionCookie("sess-456", future, "");

       expect(cookie).toContain("adakrpos_session=sess-456");
       expect(cookie).not.toContain("Domain=");
       expect(cookie).toContain("HttpOnly");
     });

     it("does NOT include SameSite=Strict", () => {
       const future = Date.now() + 7 * 24 * 60 * 60 * 1000;
       const cookie = setSessionCookie("sess-789", future, ".ada-kr-pos.com");
       expect(cookie).not.toContain("SameSite=Strict");
     });
   });

   describe("clearSessionCookie", () => {
     it("builds Max-Age=0 cookie to clear session", () => {
       const cookie = clearSessionCookie(".ada-kr-pos.com");
       expect(cookie).toContain("adakrpos_session=;");
       expect(cookie).toContain("Max-Age=0");
       expect(cookie).toContain("Domain=.ada-kr-pos.com");
     });
   });

  describe("getSessionIdFromCookie", () => {
    it("extracts session ID from Cookie header", () => {
      const sessionId = getSessionIdFromCookie("adakrpos_session=abc-123-xyz; other=value");
      expect(sessionId).toBe("abc-123-xyz");
    });

    it("returns null for null Cookie header", () => {
      expect(getSessionIdFromCookie(null)).toBeNull();
    });

    it("returns null when session cookie not present", () => {
      expect(getSessionIdFromCookie("other=value; another=test")).toBeNull();
    });
  });
});
