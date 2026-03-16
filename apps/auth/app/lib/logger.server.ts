/**
 * Logging System — ADA Auth Server
 *
 * OVERVIEW
 * Structured JSON logging to Cloudflare Workers Logs (console.log → Workers dashboard).
 * Every log entry: { level, message, timestamp, requestId?, ...meta }
 *
 * LOG LEVELS
 * - debug: Dev/trace info, internals (cache hits, session lookups)
 * - info:  Normal operations (auth success, session create, profile update)
 * - warn:  Security events and anomalies (auth fail, rate limit, CSRF, key regen, slow API)
 * - error: Unexpected failures (uncaught errors, external API errors)
 *
 * REQUIRED FIELDS
 * Every entry must have: level, message, timestamp (ISO 8601), requestId (when in request scope)
 *
 * MASKING RULES (MANDATORY)
 * - API keys:     maskApiKey()       → first 11 chars + "..."
 * - Session IDs:  maskSessionId()    → first 8 chars + "..."
 * - Emails:       maskEmail()        → u***@domain.com
 * - Secrets:      maskSecret()       → [REDACTED]
 * - Auth headers: maskAuthHeader()   → Bearer [MASKED]
 * - null/empty:                      → [EMPTY]
 *
 * NAMING CONVENTION
 * Messages use "Subject verb" format: "Session created", "User logged out",
 * "Rate limit exceeded", "Apple token exchange"
 *
 * SECURITY EVENTS (always warn level)
 * Auth failures, rate limit exceeded, CSRF validation failed,
 * API key regenerated, callback URL rejected
 *
 * PERFORMANCE EVENTS
 * External API calls (Apple OAuth, Resend): log duration in ms
 * Slow threshold: > 2000ms → warn level
 *
 * NEVER LOG
 * Request/response bodies, full secrets (APPLE_PRIVATE_KEY, RESEND_API_KEY, AUTH_SECRET),
 * verification tokens, full cookie values, health check requests (at info level)
 *
 * USAGE
 * Route handlers: const { logger } = context; → logger.info("message", meta)
 * Lib functions:  import { log } from "~/lib/logger.server"; → log("info", "message", meta)
 * SDK:            new AdakrposLogFn callback in config → zero output if not provided
 */
import { AppError } from "~/lib/error.server";

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown> | undefined;

type Logger = {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
  debug: (message: string, meta?: unknown) => void;
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function isLoggable(level: LogLevel, minimumLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minimumLevel];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUnknown(value: unknown): unknown {
  if (value instanceof AppError) {
    return {
      name: value.name,
      message: value.message,
      status: value.status,
      code: value.code,
    };
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (value instanceof Response) {
    return {
      type: "Response",
      status: value.status,
      message: "Non-Error throwable",
    };
  }

  return value;
}

function normalizeMeta(meta: unknown): LogMeta {
  if (meta === null || meta === undefined) {
    return undefined;
  }

  const normalized = normalizeUnknown(meta);

  if (isRecord(normalized)) {
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(normalized)) {
      output[key] = normalizeUnknown(value);
    }

    return output;
  }

  return {
    meta: normalized,
  };
}

function writeLogEntry(
  entry: Record<string, unknown>,
  originalMessage: string,
): void {
  try {
    console.log(JSON.stringify(entry));
  } catch (error) {
    const fallbackError =
      error instanceof Error ? error.message : String(error);

    try {
      console.log(
        JSON.stringify({
          level: "error",
          message: "Log serialization failed",
          originalMessage,
          error: fallbackError,
        }),
      );
    } catch {
      console.log(
        '{"level":"error","message":"Log serialization failed","originalMessage":"unknown","error":"unknown"}',
      );
    }
  }
}

function createLogMethod(
  level: LogLevel,
  requestId: string | undefined,
  minimumLevel: LogLevel,
) {
  return (message: string, meta?: unknown): void => {
    if (!isLoggable(level, minimumLevel)) {
      return;
    }

    const normalizedMeta = normalizeMeta(meta);

    const entry: Record<string, unknown> = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
      ...(normalizedMeta ?? {}),
    };

    writeLogEntry(entry, message);
  };
}

export function createLogger(
  requestId?: string,
  minimumLevel: LogLevel = "info",
): Logger {
  return {
    debug: createLogMethod("debug", requestId, minimumLevel),
    info: createLogMethod("info", requestId, minimumLevel),
    warn: createLogMethod("warn", requestId, minimumLevel),
    error: createLogMethod("error", requestId, minimumLevel),
  };
}

export function log(level: LogLevel, message: string, meta?: unknown): void {
  const logger = createLogger();
  logger[level](message, meta);
}

function normalizeMaskInput(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "[EMPTY]";
  }

  return value;
}

export function maskApiKey(key: string | null | undefined): string {
  const normalized = normalizeMaskInput(key);
  if (normalized === "[EMPTY]") {
    return normalized;
  }

  if (normalized.length <= 11) {
    return normalized;
  }

  return `${normalized.slice(0, 11)}...`;
}

export function maskSessionId(id: string | null | undefined): string {
  const normalized = normalizeMaskInput(id);
  if (normalized === "[EMPTY]") {
    return normalized;
  }

  if (normalized.length <= 8) {
    return normalized;
  }

  return `${normalized.slice(0, 8)}...`;
}

export function maskEmail(email: string | null | undefined): string {
  const normalized = normalizeMaskInput(email);
  if (normalized === "[EMPTY]") {
    return normalized;
  }

  const [user, domain] = normalized.split("@");
  if (!user || !domain) {
    return "[EMPTY]";
  }

  return `${user[0]}***@${domain}`;
}

export function maskSecret(value: string | null | undefined): string {
  const normalized = normalizeMaskInput(value);
  if (normalized === "[EMPTY]") {
    return normalized;
  }

  return "[REDACTED]";
}

export function maskAuthHeader(header: string | null | undefined): string {
  const normalized = normalizeMaskInput(header);
  if (normalized === "[EMPTY]") {
    return normalized;
  }

  return "Bearer [MASKED]";
}
