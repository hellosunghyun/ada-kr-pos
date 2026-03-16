import type { ActionFunctionArgs } from "react-router";
import { createLogger } from "~/lib/logger.server";
import { requireSdkApiKey } from "~/lib/rate-limit.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { logger = createLogger() } = context;
  logger.info("SDK key verification request");

  const auth = await requireSdkApiKey(request, context);

  if (auth instanceof Response) {
    logger.warn("SDK key verification failed");
    return auth;
  }

  logger.info("SDK key verification successful");
  return Response.json({ valid: true });
}
