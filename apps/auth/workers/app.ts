import { createRequestHandler } from "react-router";
import { type LogLevel, createLogger } from "~/lib/logger.server";
import type { Env } from "~/types/env";

declare global {
  interface CloudflareEnvironment extends Env {}
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    const pathname = new URL(request.url).pathname;
    const logger = createLogger(
      requestId,
      (env.LOG_LEVEL as LogLevel) ?? "info",
    );

    let response: Response | undefined;
    let status = 500;

    try {
      response = await requestHandler(request, {
        cloudflare: { env, ctx },
        logger,
      });
      status = response.status;
    } finally {
      if (pathname !== "/api/health") {
        logger.info("HTTP request", {
          method: request.method,
          path: pathname,
          status,
          duration: Date.now() - startTime,
        });
      }
    }

    return response || new Response("Internal Server Error", { status: 500 });
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
