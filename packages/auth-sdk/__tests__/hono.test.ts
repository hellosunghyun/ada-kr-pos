import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearApiKeyCache, clearSessionCache } from "../src/cache";
import { adakrposAuth, getAuth, requireAuth } from "../src/hono";

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

describe("Hono middleware", () => {
  beforeEach(() => {
    clearApiKeyCache();
    clearSessionCache();
  });

  afterEach(() => {
    clearApiKeyCache();
    clearSessionCache();
    vi.restoreAllMocks();
  });

  it("sets the auth function on context", async () => {
    const app = new Hono();

    app.use("*", adakrposAuth(config));
    app.get("/", (c) =>
      c.json({ hasAuth: typeof c.get("auth") === "function" }),
    );

    const response = await app.request("http://localhost/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasAuth: true });
  });

  it("returns an unauthenticated context when no session cookie is present", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const app = new Hono();

    app.use("*", adakrposAuth(config));
    app.get("/", async (c) => c.json(await getAuth(c)));

    const response = await app.request("http://localhost/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
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
    const app = new Hono();

    app.use("*", adakrposAuth(config));
    app.get("/", async (c) => c.json(await getAuth(c)));

    const response = await app.request("http://localhost/", {
      headers: { Cookie: "adakrpos_session=session_123" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
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
    const app = new Hono();

    app.use("*", requireAuth(config));
    app.get("/", (c) => c.text("ok"));

    const response = await app.request("http://localhost/");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("allows authenticated requests through requireAuth", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(validSession), { status: 200 }),
      );
    const app = new Hono();

    app.use("*", requireAuth(config));
    app.get("/", async (c) => c.json(await getAuth(c)));

    const response = await app.request("http://localhost/", {
      headers: { Cookie: "adakrpos_session=session_123" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...validSession,
      isAuthenticated: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call the auth server until getAuth is invoked", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(validSession), { status: 200 }),
      );
    const app = new Hono();

    app.use("*", adakrposAuth(config));
    app.get("/", (c) => c.text("ok"));

    const response = await app.request("http://localhost/", {
      headers: { Cookie: "adakrpos_session=session_123" },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls the auth server when getAuth is invoked", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(validSession), { status: 200 }),
      );
    const app = new Hono();

    app.use("*", adakrposAuth(config));
    app.get("/", async (c) => {
      await getAuth(c);
      return c.text("ok");
    });

    const response = await app.request("http://localhost/", {
      headers: { Cookie: "adakrpos_session=session_123" },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
