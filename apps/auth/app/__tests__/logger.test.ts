import { afterEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "~/lib/error.server";
import {
  createLogger,
  log,
  maskApiKey,
  maskAuthHeader,
  maskEmail,
  maskSecret,
  maskSessionId,
} from "~/lib/logger.server";

function parseLogCall(spy: ReturnType<typeof vi.spyOn>, index = 0) {
  const value = spy.mock.calls[index]?.[0];
  return JSON.parse(String(value)) as Record<string, unknown>;
}

describe("logger.server", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createLogger returns info/warn/error/debug methods", () => {
    const logger = createLogger("req-123");

    expect(logger.info).toBeTypeOf("function");
    expect(logger.warn).toBeTypeOf("function");
    expect(logger.error).toBeTypeOf("function");
    expect(logger.debug).toBeTypeOf("function");
  });

  it("writes JSON entry with level/message/timestamp/requestId", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("req-iso");

    logger.info("hello", { route: "/api/test" });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const payload = parseLogCall(consoleSpy);
    expect(payload.level).toBe("info");
    expect(payload.message).toBe("hello");
    expect(payload.requestId).toBe("req-iso");
    expect(payload.route).toBe("/api/test");
    expect(typeof payload.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(String(payload.timestamp)))).toBe(false);
  });

  it("propagates requestId for all logger methods", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("req-all");

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(consoleSpy).toHaveBeenCalledTimes(3);
    for (const call of consoleSpy.mock.calls) {
      const payload = JSON.parse(String(call[0])) as Record<string, unknown>;
      expect(payload.requestId).toBe("req-all");
    }
  });

  it("standalone log writes entry without requestId", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    log("info", "standalone");

    const payload = parseLogCall(consoleSpy);
    expect(payload.level).toBe("info");
    expect(payload.message).toBe("standalone");
    expect(payload.requestId).toBeUndefined();
  });

  it("normalizes primitive meta into { meta }", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("req-meta");

    logger.info("primitive", "abc");

    const payload = parseLogCall(consoleSpy);
    expect(payload.meta).toBe("abc");
  });

  it("extracts structured AppError fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("req-app-error");

    logger.error("validation failed", {
      error: new ValidationError("bad payload"),
    });

    const payload = parseLogCall(consoleSpy);
    expect(payload.error).toEqual({
      name: "ValidationError",
      message: "bad payload",
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("normalizes native Error and Response metadata safely", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("req-errors");

    logger.error("native", { error: new Error("boom") });
    logger.warn("response", new Response(null, { status: 418 }));

    const nativePayload = parseLogCall(consoleSpy, 0);
    const responsePayload = parseLogCall(consoleSpy, 1);

    expect(nativePayload.error).toEqual({ name: "Error", message: "boom" });
    expect(responsePayload).toMatchObject({
      level: "warn",
      type: "Response",
      status: 418,
      message: "Non-Error throwable",
    });
  });

  it("handles circular metadata by logging fallback entry", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("req-circular");
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(() => logger.info("circular meta", circular)).not.toThrow();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const payload = parseLogCall(consoleSpy);
    expect(payload).toMatchObject({
      level: "error",
      message: "Log serialization failed",
      originalMessage: "circular meta",
    });
    expect(payload.error).toBeTypeOf("string");
  });

  it("handles double console failures via hardcoded fallback JSON", () => {
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementationOnce(() => {
        throw new Error("first");
      })
      .mockImplementationOnce(() => {
        throw new Error("second");
      })
      .mockImplementation(() => {});
    const logger = createLogger();

    expect(() => logger.info("trigger nested fallback")).not.toThrow();
    expect(consoleSpy).toHaveBeenCalledTimes(3);

    const payload = parseLogCall(consoleSpy, 2);
    expect(payload).toEqual({
      level: "error",
      message: "Log serialization failed",
      originalMessage: "unknown",
      error: "unknown",
    });
  });

  it("filters entries below configured minimum level", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("req-filter", "warn");

    logger.debug("skip debug");
    logger.info("skip info");
    logger.warn("keep warn");
    logger.error("keep error");

    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(parseLogCall(consoleSpy, 0).level).toBe("warn");
    expect(parseLogCall(consoleSpy, 1).level).toBe("error");
  });

  it("maskApiKey handles long, empty, and short values", () => {
    expect(maskApiKey("ak_1234567890abcdef")).toBe("ak_12345678...");
    expect(maskApiKey("")).toBe("[EMPTY]");
    expect(maskApiKey("short")).toBe("short");
  });

  it("maskSessionId handles long, null, and short values", () => {
    expect(maskSessionId("sess1234abcd")).toBe("sess1234...");
    expect(maskSessionId(null)).toBe("[EMPTY]");
    expect(maskSessionId("short")).toBe("short");
  });

  it("maskEmail handles valid and invalid formats", () => {
    expect(maskEmail("user@example.com")).toBe("u***@example.com");
    expect(maskEmail("")).toBe("[EMPTY]");
    expect(maskEmail("nodomain")).toBe("[EMPTY]");
  });

  it("maskSecret always redacts non-empty values", () => {
    expect(maskSecret("any-secret")).toBe("[REDACTED]");
    expect(maskSecret("")).toBe("[EMPTY]");
  });

  it("maskAuthHeader masks all non-empty input", () => {
    expect(maskAuthHeader("Bearer abc123")).toBe("Bearer [MASKED]");
    expect(maskAuthHeader("Token x")).toBe("Bearer [MASKED]");
    expect(maskAuthHeader(undefined)).toBe("[EMPTY]");
  });
});
