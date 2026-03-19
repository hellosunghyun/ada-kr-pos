import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearApiKeyCache,
  clearSessionCache,
  getCachedApiKeyValidity,
  setCachedApiKeyValidity,
} from "../src/cache";
import { createAdakrposAuth } from "../src/client";

describe("createAdakrposAuth", () => {
  beforeEach(() => {
    clearApiKeyCache();
    clearSessionCache();
  });

  afterEach(() => {
    clearApiKeyCache();
    clearSessionCache();
    vi.restoreAllMocks();
  });

  it("returns a client with verifySession, getUser, and getCurrentUser", () => {
    const client = createAdakrposAuth({ apiKey: "ak_test" });

    expect(client.verifySession).toBeTypeOf("function");
    expect(client.getUser).toBeTypeOf("function");
    expect(client.getCurrentUser).toBeTypeOf("function");
  });

  it("sends verifySession requests to the SDK verify endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: null, session: null }), {
        status: 404,
      }),
    );
    const client = createAdakrposAuth({
      apiKey: "ak_test",
      authUrl: "https://example.com",
    });

    await client.verifySession("session_123");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/api/sdk/verify-session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "session_123" }),
        headers: expect.objectContaining({
          Authorization: "Bearer ak_test",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("returns null when verifySession receives a 401 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );
    const client = createAdakrposAuth({ apiKey: "ak_test" });

    await expect(client.verifySession("session_123")).resolves.toBeNull();
    expect(getCachedApiKeyValidity("ak_test")).toBe(false);
  });

  it("returns user and session data when verifySession succeeds", async () => {
    const payload = {
      user: {
        id: "user_123",
        email: "user@example.com",
        verifiedEmail: "verified@example.com",
        nickname: "ada",
        name: "Ada",
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    const client = createAdakrposAuth({ apiKey: "ak_test" });

    await expect(client.verifySession("session_123")).resolves.toEqual(payload);
    expect(getCachedApiKeyValidity("ak_test")).toBe(true);
  });

  it("sends getUser requests to the SDK user endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 404 }));
    const client = createAdakrposAuth({
      apiKey: "ak_test",
      authUrl: "https://example.com/base",
    });

    await client.getUser("user_123");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/api/sdk/users/user_123",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer ak_test",
        }),
      }),
    );
  });

  it("returns null when getUser receives a 404 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    const client = createAdakrposAuth({ apiKey: "ak_test" });

    await expect(client.getUser("missing_user")).resolves.toBeNull();
    expect(getCachedApiKeyValidity("ak_test")).toBe(true);
  });

  it("returns the authenticated user from getCurrentUser", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: "user_123",
            email: null,
            verifiedEmail: null,
            nickname: null,
            name: "Ada",
            profilePhotoUrl: null,
            bio: null,
            contact: null,
            snsLinks: {},
            cohort: null,
            isVerified: false,
            createdAt: 1,
            updatedAt: 2,
          },
          session: {
            id: "session_123",
            userId: "user_123",
            expiresAt: 10,
            createdAt: 5,
          },
        }),
        { status: 200 },
      ),
    );
    const client = createAdakrposAuth({ apiKey: "ak_test" });

    await expect(client.getCurrentUser("session_123")).resolves.toEqual(
      expect.objectContaining({ id: "user_123", name: "Ada" }),
    );
  });

  it("skips duplicate requests after caching an invalid API key", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));
    const client = createAdakrposAuth({ apiKey: "ak_test" });

    await expect(client.verifySession("session_123")).resolves.toBeNull();
    await expect(client.verifySession("session_123")).resolves.toBeNull();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("reuses in-flight verifySession requests for the same session", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(fetchPromise);
    const client = createAdakrposAuth({ apiKey: "ak_test" });

    const first = client.verifySession("session_shared");
    const second = client.verifySession("session_shared");

    resolveFetch?.(
      new Response(
        JSON.stringify({
          user: {
            id: "user_1",
            email: null,
            verifiedEmail: null,
            nickname: null,
            name: null,
            profilePhotoUrl: null,
            bio: null,
            contact: null,
            snsLinks: {},
            cohort: null,
            isVerified: false,
            createdAt: 1,
            updatedAt: 2,
          },
          session: {
            id: "session_shared",
            userId: "user_1",
            expiresAt: 10,
            createdAt: 5,
          },
        }),
        { status: 200 },
      ),
    );

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual(secondResult);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("serves verifySession from short-lived session cache", async () => {
    vi.useFakeTimers();

    const payload = {
      user: {
        id: "user_cached",
        email: null,
        verifiedEmail: null,
        nickname: null,
        name: null,
        profilePhotoUrl: null,
        bio: null,
        contact: null,
        snsLinks: {},
        cohort: null,
        isVerified: false,
        createdAt: 1,
        updatedAt: 2,
      },
      session: {
        id: "session_cached",
        userId: "user_cached",
        expiresAt: 10,
        createdAt: 5,
      },
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify(payload), { status: 200 }),
      );

    const client = createAdakrposAuth({
      apiKey: "ak_test",
      sessionCacheTtlMs: 1000,
    });

    await expect(client.verifySession("session_cached")).resolves.toEqual(
      payload,
    );
    await expect(client.verifySession("session_cached")).resolves.toEqual(
      payload,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);

    await expect(client.verifySession("session_cached")).resolves.toEqual(
      payload,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

describe("API key cache", () => {
  beforeEach(() => {
    clearApiKeyCache();
    clearSessionCache();
  });

  afterEach(() => {
    clearApiKeyCache();
    clearSessionCache();
    vi.restoreAllMocks();
  });

  it("returns null for unknown API keys", () => {
    expect(getCachedApiKeyValidity("unknown")).toBeNull();
  });

  it("stores and retrieves cached API key validity", () => {
    setCachedApiKeyValidity("ak_test", true);

    expect(getCachedApiKeyValidity("ak_test")).toBe(true);
  });

  it("returns null when a cache entry expires", () => {
    vi.useFakeTimers();
    setCachedApiKeyValidity("ak_test", true, 100);

    vi.advanceTimersByTime(101);

    expect(getCachedApiKeyValidity("ak_test")).toBeNull();
    vi.useRealTimers();
  });

  it("clears all cached API key entries", () => {
    setCachedApiKeyValidity("ak_test", true);
    clearApiKeyCache();

    expect(getCachedApiKeyValidity("ak_test")).toBeNull();
  });
});
