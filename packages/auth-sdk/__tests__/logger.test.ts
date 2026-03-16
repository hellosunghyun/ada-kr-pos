import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearApiKeyCache } from "../src/cache";
import { createAdakrposAuth } from "../src/client";
import { requireAuthExpress } from "../src/express";
import { verifyRequest } from "../src/generic";
import { requireAuth } from "../src/hono";

describe("SDK optional logging", () => {
  beforeEach(() => {
    clearApiKeyCache();
  });

  afterEach(() => {
    clearApiKeyCache();
    vi.restoreAllMocks();
  });

  it("produces zero console output when no logger provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    const client = createAdakrposAuth({ apiKey: "ak_test" });

    await client.verifySession("session_123");

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("calls logger callback for API calls and cache events", async () => {
    const logger = vi.fn();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));
    const client = createAdakrposAuth({ apiKey: "ak_test", logger });

    await client.verifySession("session_123");
    await client.verifySession("session_123");
    clearApiKeyCache(logger);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(logger).toHaveBeenCalledWith(
      "debug",
      "API key cache miss",
      expect.objectContaining({ apiKey: "ak_test" }),
    );
    expect(logger).toHaveBeenCalledWith(
      "info",
      "SDK API call",
      expect.objectContaining({
        method: "POST",
        url: "https://ada-kr-pos.com/api/sdk/verify-session",
      }),
    );
    expect(logger).toHaveBeenCalledWith(
      "info",
      "SDK API response",
      expect.objectContaining({
        status: 401,
        url: "https://ada-kr-pos.com/api/sdk/verify-session",
      }),
    );
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "SDK API failed",
      expect.objectContaining({
        status: 401,
        url: "https://ada-kr-pos.com/api/sdk/verify-session",
      }),
    );
    expect(logger).toHaveBeenCalledWith(
      "debug",
      "API key cache hit",
      expect.objectContaining({ apiKey: "ak_test" }),
    );
    expect(logger).toHaveBeenCalledWith(
      "info",
      "API key cache cleared",
      undefined,
    );

    const responseLog = logger.mock.calls.find(
      ([, message]) => message === "SDK API response",
    );

    expect(responseLog).toBeDefined();
    expect(responseLog?.[2]).toEqual(
      expect.objectContaining({ duration: expect.any(Number) }),
    );
  });

  it("logs generic auth resolution and cookie decode failures", async () => {
    const logger = vi.fn();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    const request = new Request("http://localhost/", {
      headers: {
        Cookie: "adakrpos_session=%E0%A4%A",
      },
    });

    const auth = await verifyRequest(request, { apiKey: "ak_test", logger });

    expect(auth).toEqual({
      user: null,
      session: null,
      isAuthenticated: false,
    });
    expect(logger).toHaveBeenCalledWith(
      "debug",
      "Cookie decode failed",
      expect.objectContaining({ error: expect.anything() }),
    );
    expect(logger).toHaveBeenCalledWith(
      "info",
      "Auth resolved",
      expect.objectContaining({ isAuthenticated: false }),
    );
  });

  it("logs auth denial in Hono middleware", async () => {
    const logger = vi.fn();
    const app = new Hono();

    app.use("*", requireAuth({ apiKey: "ak_test", logger }));
    app.get("/", (c) => c.text("ok"));

    const response = await app.request("http://localhost/");

    expect(response.status).toBe(401);
    expect(
      logger.mock.calls.some(
        ([level, message]) =>
          level === "warn" && message === "Auth required: not authenticated",
      ),
    ).toBe(true);
  });

  it("logs auth denial in Express middleware", async () => {
    const logger = vi.fn();
    const middleware = requireAuthExpress({ apiKey: "ak_test", logger });
    const req = { headers: {} as { cookie?: string } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnValue({ error: "Unauthorized" }),
    };
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(
      logger.mock.calls.some(
        ([level, message]) =>
          level === "warn" && message === "Auth required: not authenticated",
      ),
    ).toBe(true);
  });
});
