import { log } from "~/lib/logger.server";

export async function validateCsrf(request: Request): Promise<void> {
  const method = request.method.toUpperCase();

  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return;
  }

  const origin = request.headers.get("Origin");
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  const allowedOrigin = requestOrigin;

  if (!origin || origin !== requestOrigin) {
    log("warn", "CSRF validation failed", {
      origin,
      expected: allowedOrigin,
    });
    throw new Response("Forbidden", { status: 403 });
  }
}
