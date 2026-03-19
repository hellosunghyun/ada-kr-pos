import { createRequestHandler } from "react-router";
import { type LogLevel, createLogger } from "~/lib/logger.server";
import type { Env } from "~/types/env";

declare global {
  interface CacheStorage {
    default: Cache;
  }

  interface CloudflareEnvironment extends Env {}
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

// Logging: Every request (except /api/health) is logged as structured JSON to Cloudflare Workers Logs.
// Each entry includes requestId (UUID), method, path, status, duration. LOG_LEVEL env var controls
// verbosity (default: "info"). See apps/auth/app/lib/logger.server.ts for full conventions.
export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    const pathname = new URL(request.url).pathname;
    const logger = createLogger(
      requestId,
      (env.LOG_LEVEL as LogLevel) ?? "info",
    );

    if (request.method === "GET" && pathname === "/__manifest") {
      const cache = caches.default;
      const cacheKey = new Request(request.url, { method: "GET" });
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }
      const freshResponse = await requestHandler(request, {
        cloudflare: { env, ctx },
        logger,
      });
      if (freshResponse.ok) {
        ctx.waitUntil(cache.put(cacheKey, freshResponse.clone()));
      }
      return freshResponse;
    }

    let response: Response;
    let status = 500;

    try {
      response = await requestHandler(request, {
        cloudflare: { env, ctx },
        logger,
      });
      status = response.status;
    } catch (error) {
      logger.error("Unhandled request error", {
        error,
        method: request.method,
        path: pathname,
      });
      status = 500;
      response = Response.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    } finally {
      if (pathname !== "/api/health") {
        logger.info("HTTP request", {
          method: request.method,
          path: pathname,
          status,
          duration: Date.now() - startTime,
          userId: "anonymous",
        });
      }
    }

    return response;
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
