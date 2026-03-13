import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearApiKeyCache } from "../src/cache";
import { adaposAuthExpress, requireAuthExpress } from "../src/express";
import { verifyRequest } from "../src/generic";

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
  });

  afterEach(() => {
    clearApiKeyCache();
    vi.restoreAllMocks();
  });

  it("attaches auth function to req", async () => {
    const middleware = adaposAuthExpress(config);
    const req = { headers: {} };
    const res = {};
    let nextCalled = false;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(typeof req.auth).toBe("function");
  });

  it("returns an unauthenticated context when no session cookie is present", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const middleware = adaposAuthExpress(config);
    const req = { headers: {} };
    const res = {};

    await middleware(req, res, () => {});

    const authContext = await req.auth();

    expect(authContext).toEqual({
      user: null,
      session: null,
      isAuthenticated: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns an authenticated context when the session is valid", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(validSession), { status: 200 }),
    );
    const middleware = adaposAuthExpress(config);
    const req = { headers: { cookie: "session=session_123" } };
    const res = {};

    await middleware(req, res, () => {});

    const authContext = await req.auth();

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
    const req = { headers: {} };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnValue({}),
    };

    await middleware(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("allows authenticated requests through requireAuthExpress", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(validSession), { status: 200 }),
    );
    const middleware = requireAuthExpress(config);
    const req = { headers: { cookie: "session=session_123" } };
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
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(validSession), { status: 200 }),
    );
    const middleware = adaposAuthExpress(config);
    const req = { headers: { cookie: "session=session_123" } };
    const res = {};

    await middleware(req, res, () => {});

    expect(fetchSpy).not.toHaveBeenCalled();

    await req.auth();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("caches auth result on subsequent calls", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(validSession), { status: 200 }),
    );
    const middleware = adaposAuthExpress(config);
    const req = { headers: { cookie: "session=session_123" } };
    const res = {};

    await middleware(req, res, () => {});

    await req.auth();
    await req.auth();
    await req.auth();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Generic verifyRequest helper", () => {
  beforeEach(() => {
    clearApiKeyCache();
  });

  afterEach(() => {
    clearApiKeyCache();
    vi.restoreAllMocks();
  });

  it("returns an unauthenticated context when no session cookie is present", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
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
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(validSession), { status: 200 }),
    );
    const request = new Request("http://localhost/", {
      headers: { Cookie: "session=session_123" },
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
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(validSession), { status: 200 }),
    );
    const encodedSessionId = encodeURIComponent("session_with_special_chars=123");
    const request = new Request("http://localhost/", {
      headers: { Cookie: `session=${encodedSessionId}` },
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
});
