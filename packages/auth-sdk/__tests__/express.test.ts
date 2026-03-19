import { SignJWT, exportSPKI, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearApiKeyCache, clearSessionCache } from "../src/cache";
import { adakrposAuthExpress, requireAuthExpress } from "../src/express";
import {
  buildEdgeTokenCookie,
  consumePendingEdgeToken,
  getPendingEdgeToken,
  verifyRequest,
} from "../src/generic";
import type { AuthContext } from "../src/types";

type TestReq = {
  headers: { cookie?: string };
  auth?: () => Promise<AuthContext>;
};

const config = {
  apiKey: "ak_test",
  authUrl: "https://example.com",
};

const validSession = {
  user: {
    id: "user_123",
    email: "user@example.com",
    verifiedEmail: "verified@example.com",
    nickname: "ada",
    name: "Ada Lovelace",
    profilePhotoUrl: null,
    bio: null,
    contact: null,
    snsLinks: {},
    cohort: null,
    isVerified: true,
    createdAt: 1,
    updatedAt: 2,
  },
  session: {
    id: "session_123",
    userId: "user_123",
    expiresAt: 10,
    createdAt: 5,
  },
};

describe("Express middleware", () => {
  beforeEach(() => {
    clearApiKeyCache();
    clearSessionCache();
  });

  afterEach(() => {
    clearApiKeyCache();
    clearSessionCache();
    vi.restoreAllMocks();
  });

  it("attaches auth function to req", async () => {
    const middleware = adakrposAuthExpress(config);
    const req: TestReq = { headers: {} };
    const res = {};
    let nextCalled = false;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(typeof req.auth).toBe("function");
  });

  it("returns an unauthenticated context when no session cookie is present", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const middleware = adakrposAuthExpress(config);
    const req: TestReq = { headers: {} };
    const res = {};

    await middleware(req, res, () => {});

    const authFn = req.auth;
    if (!authFn) throw new Error("auth function was not attached");
    const authContext = await authFn();

    expect(authContext).toEqual({
      user: null,
      session: null,
      isAuthenticated: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns an authenticated context when the session is valid", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(validSession), { status: 200 }),
      );
    const middleware = adakrposAuthExpress(config);
    const req: TestReq = {
      headers: { cookie: "adakrpos_session=session_123" },
    };
    const res = {};

    await middleware(req, res, () => {});

    const authFn = req.auth;
    if (!authFn) throw new Error("auth function was not attached");
    const authContext = await authFn();

    expect(authContext).toEqual({
      ...validSession,
      isAuthenticated: true,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/api/sdk/verify-session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "session_123" }),
      }),
    );
  });

  it("returns 401 when auth is required and no session exists", async () => {
    const middleware = requireAuthExpress(config);
    const req: TestReq = { headers: {} };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnValue({}),
    };

    await middleware(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("allows authenticated requests through requireAuthExpress", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(validSession), { status: 200 }),
      );
    const middleware = requireAuthExpress(config);
    const req: TestReq = {
      headers: { cookie: "adakrpos_session=session_123" },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    let nextCalled = false;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call the auth server until auth is invoked", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(validSession), { status: 200 }),
      );
    const middleware = adakrposAuthExpress(config);
    const req: TestReq = {
      headers: { cookie: "adakrpos_session=session_123" },
    };
    const res = {};

    await middleware(req, res, () => {});

    expect(fetchSpy).not.toHaveBeenCalled();

    const authFn = req.auth;
    if (!authFn) throw new Error("auth function was not attached");
    await authFn();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("caches auth result on subsequent calls", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(validSession), { status: 200 }),
      );
    const middleware = adakrposAuthExpress(config);
    const req: TestReq = {
      headers: { cookie: "adakrpos_session=session_123" },
    };
    const res = {};

    await middleware(req, res, () => {});

    const authFn = req.auth;
    if (!authFn) throw new Error("auth function was not attached");
    await authFn();
    await authFn();
    await authFn();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Generic verifyRequest helper", () => {
  beforeEach(() => {
    clearApiKeyCache();
    clearSessionCache();
  });

  afterEach(() => {
    clearApiKeyCache();
    clearSessionCache();
    vi.restoreAllMocks();
  });

  it("returns an unauthenticated context when no session cookie is present", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = new Request("http://localhost/", {
      headers: {},
    });

    const authContext = await verifyRequest(request, config);

    expect(authContext).toEqual({
      user: null,
      session: null,
      isAuthenticated: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns an authenticated context when the session is valid", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(validSession), { status: 200 }),
      );
    const request = new Request("http://localhost/", {
      headers: { Cookie: "adakrpos_session=session_123" },
    });

    const authContext = await verifyRequest(request, config);

    expect(authContext).toEqual({
      ...validSession,
      isAuthenticated: true,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/api/sdk/verify-session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "session_123" }),
      }),
    );
  });

  it("handles URL-encoded session IDs", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(validSession), { status: 200 }),
      );
    const encodedSessionId = encodeURIComponent(
      "session_with_special_chars=123",
    );
    const request = new Request("http://localhost/", {
      headers: { Cookie: `adakrpos_session=${encodedSessionId}` },
    });

    const authContext = await verifyRequest(request, config);

    expect(authContext.isAuthenticated).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/api/sdk/verify-session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "session_with_special_chars=123" }),
      }),
    );
  });

  it("resolves auth from edge token without network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicKeyPem = await exportSPKI(publicKey);
    const now = Math.floor(Date.now() / 1000);

    const edgeToken = await new SignJWT({
      sid: "session_123",
      user: validSession.user,
      session: validSession.session,
    })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setIssuer("https://ada-kr-pos.com")
      .setAudience("adakrpos-edge")
      .setSubject(validSession.user.id)
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .sign(privateKey);

    const request = new Request("http://localhost/", {
      headers: {
        Cookie: `adakrpos_session=session_123; adakrpos_edge=${edgeToken}`,
      },
    });

    const authContext = await verifyRequest(request, config, {
      edge: { publicKey: publicKeyPem },
    });

    expect(authContext).toEqual({
      ...validSession,
      isAuthenticated: true,
      edgeToken,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forces network verify when forceVerify is enabled", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicKeyPem = await exportSPKI(publicKey);
    const now = Math.floor(Date.now() / 1000);

    const edgeToken = await new SignJWT({
      sid: "session_123",
      user: validSession.user,
      session: validSession.session,
    })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setIssuer("https://ada-kr-pos.com")
      .setAudience("adakrpos-edge")
      .setSubject(validSession.user.id)
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .sign(privateKey);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ...validSession, edgeToken: "fresh-edge" }),
        {
          status: 200,
        },
      ),
    );
    const request = new Request("http://localhost/", {
      headers: {
        Cookie: `adakrpos_session=session_123; adakrpos_edge=${edgeToken}`,
      },
    });

    const authContext = await verifyRequest(request, config, {
      edge: { publicKey: publicKeyPem },
      forceVerify: true,
    });

    expect(authContext.isAuthenticated).toBe(true);
    if (!authContext.isAuthenticated) {
      throw new Error("Expected authenticated context");
    }
    expect(authContext.edgeToken).toBe("fresh-edge");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("stores and consumes pending edge token from network fallback", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ...validSession,
          edgeToken: "edge-token-from-server",
        }),
        { status: 200 },
      ),
    );
    const request = new Request("http://localhost/", {
      headers: { Cookie: "adakrpos_session=session_123" },
    });

    await verifyRequest(request, config, { forceVerify: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getPendingEdgeToken(request)).toBe("edge-token-from-server");
    expect(consumePendingEdgeToken(request)).toBe("edge-token-from-server");
    expect(getPendingEdgeToken(request)).toBeNull();
  });

  it("builds secure edge token cookie header", () => {
    const cookie = buildEdgeTokenCookie("token-123", {
      domain: ".ada-kr-pos.com",
    });

    expect(cookie).toContain("adakrpos_edge=token-123");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Domain=.ada-kr-pos.com");
    expect(cookie).toContain("Max-Age=120");
  });
});
