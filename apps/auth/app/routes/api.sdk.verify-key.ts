import type { ActionFunctionArgs } from "react-router";
import { createLogger } from "~/lib/logger.server";
import { requireSdkApiKey } from "~/lib/rate-limit.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { logger = createLogger() } = context;
  logger.info("SDK key verification request");

  try {
    const auth = await requireSdkApiKey(request, context);

    if (auth instanceof Response) {
      logger.warn("SDK key verification failed");
      auth.headers.set("Cache-Control", "no-store");
      return auth;
    }

    logger.info("SDK key verification successful");
    return Response.json(
      { valid: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("Key verification failed", { error });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
