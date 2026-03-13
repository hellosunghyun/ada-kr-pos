/**
 * Structured JSON logging for ADA Auth Server
 * Outputs to console (CF Workers sends to Worker Logs)
 * Includes sensitive data masking for API keys and session IDs
 */

type LogLevel = "info" | "warn" | "error" | "debug";

/**
 * Log a message with optional metadata
 * Outputs JSON to console with timestamp
 */
export function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): void {
  const logEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  console.log(JSON.stringify(logEntry));
}

/**
 * Log an HTTP request with method, path, status, and duration
 */
export function logRequest(
  method: string,
  path: string,
  status: number,
  duration: number,
  userId?: string
): void {
  log("info", "HTTP request", {
    method,
    path,
    status,
    duration,
    ...(userId && { userId }),
  });
}

/**
 * Mask an API key for safe logging
 * Returns first 11 characters followed by "..."
 */
export function maskApiKey(key: string): string {
  if (key.length <= 11) return key;
  return `${key.slice(0, 11)}...`;
}

/**
 * Mask a session ID for safe logging
 * Returns first 8 characters followed by "..."
 */
export function maskSessionId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 8)}...`;
}
