import type { LoaderFunctionArgs } from "react-router";
import { createLogger } from "~/lib/logger.server";
import type { Env } from "~/types/env";

export async function loader({ params, context }: LoaderFunctionArgs) {
  const { logger = createLogger() } = context;
  const key = params["*"];

  logger.debug("Photo requested", { path: key });

  if (!key) {
    return new Response("Not Found", { status: 404 });
  }

  const env = (context as any).cloudflare.env as Env;
  const object = await env.PROFILE_PHOTOS.get(key);

  if (!object) {
    return new Response("Not Found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "image/webp");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}
